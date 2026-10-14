import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { roleSchema, staffEraseSchema, staffInvitationResendSchema, staffInviteSchema, staffUpdateSchema } from '@hedax/contracts';
import { PERMISSIONS, assertCanGrant, assertNotLastOwner } from '@hedax/domain';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { CurrentActor, RequirePermissions } from '../../common/auth/decorators.js';
import { SessionService } from '../../common/auth/session.service.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { AuthService } from '../auth/auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { InvitationsService } from './invitations.service.js';
import { StaffErasureService } from './staff-erasure.service.js';

/**
 * Staff, roles and permissions (spec §13). Nobody can grant more than they
 * hold, change their own roles, or remove the last owner. Role changes and
 * suspensions revoke sessions and live sockets immediately.
 */
@ApiTags('admin/staff')
@Controller('admin')
export class StaffController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly invitations: InvitationsService,
    private readonly mail: MailService,
    private readonly erasure: StaffErasureService,
  ) {}

  @RequirePermissions('users.manage')
  @Get('permissions')
  permissions() {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));
  }

  @RequirePermissions('users.manage')
  @Get('roles')
  async roles() {
    const rows = await this.prisma.role.findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => ({
      id: r.id, key: r.key, nameFa: r.nameFa, nameEn: r.nameEn, isSystem: r.isSystem, isOwner: r.isOwner, requiresMfa: r.requiresMfa,
      permissions: r.permissions.map((p) => p.permissionKey).sort(), members: r._count.users, version: r.version,
    }));
  }

  @RequirePermissions('roles.manage')
  @Post('roles')
  @ApiZodBody(roleSchema)
  async createRole(@CurrentActor() actor: Actor, @Body(zod(roleSchema)) body: z.infer<typeof roleSchema>) {
    assertCanGrant(actor.permissions, body.permissions);
    return this.prisma.tx(async (tx) => {
      const role = await tx.role.create({
        data: { key: body.key, nameFa: body.nameFa, nameEn: body.nameEn, requiresMfa: body.requiresMfa, permissions: { create: [...new Set(body.permissions)].map((permissionKey) => ({ permissionKey })) } },
      });
      await this.audit.record(tx, { action: 'role.created', entityType: 'role', entityId: role.id, after: body });
      return { id: role.id };
    });
  }

  @RequirePermissions('roles.manage')
  @Put('roles/:id')
  async updateRole(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(roleSchema)) body: z.infer<typeof roleSchema>) {
    assertCanGrant(actor.permissions, body.permissions);
    const affected = await this.prisma.tx(async (tx) => {
      const role = await tx.role.findUnique({ where: { id }, include: { permissions: true, users: true } });
      if (!role) throw notFound();
      if (role.isOwner) throw forbidden('OWNER_ROLE_LOCKED', 'The owner role cannot be edited');
      if (role.users.some((u) => u.userId === actor.userId)) throw forbidden('SELF_ROLE_EDIT', 'You cannot edit a role you hold');
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: [...new Set(body.permissions)].map((permissionKey) => ({ roleId: id, permissionKey })) });
      await tx.role.update({ where: { id }, data: { nameFa: body.nameFa, nameEn: body.nameEn, requiresMfa: body.requiresMfa, version: { increment: 1 } } });
      await this.audit.record(tx, { action: 'role.updated', entityType: 'role', entityId: id, before: role.permissions.map((p) => p.permissionKey), after: body.permissions });
      return role.users.map((u) => u.userId);
    });
    // Permissions are re-evaluated on every request; live sockets are re-validated now.
    for (const userId of affected) await this.sessions.revokeAllForUser(userId, 'ROLE_CHANGED');
    return { id };
  }

  @RequirePermissions('users.manage')
  @Get('staff')
  async staff(@CurrentActor() actor: Actor) {
    // Erased accounts keep only an anonymous row for history; they are not listed.
    const rows = await this.prisma.user.findMany({ where: { kind: 'STAFF', status: { not: 'DELETED' } }, include: { roles: { include: { role: true } } }, orderBy: { createdAt: 'asc' } });
    return {
      staff: rows.map((u) => ({
        id: u.id, email: u.email, fullName: u.fullName, status: u.status, mfaEnabled: !!u.mfaEnabledAt, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        roles: u.roles.map((r) => ({ id: r.roleId, key: r.role.key, nameFa: r.role.nameFa, nameEn: r.role.nameEn, isOwner: r.role.isOwner })),
        // The same rules are enforced by the erase endpoint.
        canErase: u.id !== actor.userId && !u.roles.some((r) => r.role.isOwner),
      })),
      invitations: await this.invitations.list(),
      mailConfigured: this.mail.configured,
    };
  }

  /** Invitation by e-mail (queued for the worker) with the one-time link also returned once to the inviting staff member. */
  @RequirePermissions('users.manage')
  @Post('staff/invitations')
  @ApiZodBody(staffInviteSchema)
  invite(@CurrentActor() actor: Actor, @Body(zod(staffInviteSchema)) body: z.infer<typeof staffInviteSchema>) {
    return this.invitations.invite(actor, body);
  }

  @RequirePermissions('users.manage')
  @Post('staff/invitations/:id/resend')
  @HttpCode(200)
  @ApiZodBody(staffInvitationResendSchema)
  resend(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffInvitationResendSchema)) body: z.infer<typeof staffInvitationResendSchema>) {
    return this.invitations.resend(actor, id, body.confirmCode);
  }

  @RequirePermissions('users.manage')
  @Post('staff/invitations/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.revoke(actor, id);
  }

  /** Erases an invitation that never became an account (and any other invitation to that address). */
  @RequirePermissions('users.manage')
  @Post('staff/invitations/:id/erase')
  @HttpCode(200)
  @ApiZodBody(staffEraseSchema)
  eraseInvitation(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffEraseSchema)) body: z.infer<typeof staffEraseSchema>) {
    return this.erasure.eraseInvitation(actor, id, body.confirmCode);
  }

  /** Erases a staff member: personal data, access and invitations go; history stays without a name. */
  @RequirePermissions('users.manage')
  @Post('staff/:id/erase')
  @HttpCode(200)
  @ApiZodBody(staffEraseSchema)
  eraseStaff(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffEraseSchema)) body: z.infer<typeof staffEraseSchema>) {
    return this.erasure.eraseStaff(actor, id, body.confirmCode);
  }

  @RequirePermissions('users.manage')
  @Patch('staff/:id')
  @ApiZodBody(staffUpdateSchema)
  async update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffUpdateSchema)) body: z.infer<typeof staffUpdateSchema>) {
    if (id === actor.userId) throw forbidden('SELF_EDIT', 'You cannot change your own roles or status');
    await this.prisma.tx(async (tx) => {
      const target = await tx.user.findFirst({ where: { id, kind: 'STAFF', status: { not: 'DELETED' } }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
      if (!target) throw notFound();
      const owners = await tx.userRole.findMany({ where: { role: { isOwner: true }, user: { status: 'ACTIVE' } }, select: { userId: true } });
      const ownerIds = owners.map((o) => o.userId);
      const targetIsOwner = target.roles.some((r) => r.role.isOwner);
      if (targetIsOwner && !actor.isOwner) throw forbidden('OWNER_PROTECTED');
      if (body.suspended === true && targetIsOwner) assertNotLastOwner(ownerIds, id);
      if (body.roleIds) {
        const roles = await tx.role.findMany({ where: { id: { in: body.roleIds } }, include: { permissions: true } });
        if (roles.length !== new Set(body.roleIds).size) throw badRequest('UNKNOWN_ROLE');
        if (roles.some((r) => r.isOwner) && !actor.isOwner) throw forbidden('PERMISSION_ESCALATION');
        assertCanGrant(actor.permissions, roles.flatMap((r) => r.permissions.map((p) => p.permissionKey)));
        if (targetIsOwner && !roles.some((r) => r.isOwner)) assertNotLastOwner(ownerIds, id);
        if (!targetIsOwner && roles.some((r) => r.isOwner)) await this.auth.confirmStepUp(actor, body.confirmCode);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id, grantedById: actor.userId })) });
      }
      if (body.suspended !== undefined) await tx.user.update({ where: { id }, data: { status: body.suspended ? 'SUSPENDED' : 'ACTIVE' } });
      await this.audit.record(tx, {
        action: 'staff.updated', entityType: 'user', entityId: id,
        before: { roles: target.roles.map((r) => r.role.key), status: target.status }, after: { roleIds: body.roleIds, suspended: body.suspended, reason: body.reason },
      });
    });
    // A19: role change / suspension ends every session and disconnects live sockets immediately.
    await this.sessions.revokeAllForUser(id, body.suspended ? 'SUSPENDED' : 'ROLE_CHANGED');
    return { id };
  }
}
