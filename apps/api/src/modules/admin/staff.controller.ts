import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  roleSchema, staffEraseSchema, staffInvitationResendSchema, staffInvitationUpdateSchema, staffInviteSchema, staffMfaResetSchema, staffUpdateSchema, trashPurgeSchema,
  type StaffMemberView, type StaffOptionView,
} from '@hedax/contracts';
import { PERMISSIONS, assertCanGrant, assertNotLastOwner } from '@hedax/domain';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { CurrentActor, RequirePermissions, StaffOnly } from '../../common/auth/decorators.js';
import { SessionService } from '../../common/auth/session.service.js';
import { badRequest, forbidden, notFound } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { AuthService } from '../auth/auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { InvitationsService, normalizeStaffPhone } from './invitations.service.js';
import { StaffErasureService } from './staff-erasure.service.js';
import { StaffTrashService } from './staff-trash.service.js';

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
    private readonly staffTrash: StaffTrashService,
  ) {}

  @RequirePermissions('users.manage')
  @Get('permissions')
  permissions() {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));
  }

  @RequirePermissions('users.manage')
  @Get('roles')
  async roles() {
    const rows = await this.prisma.role.findMany({ include: { permissions: true, _count: { select: { users: { where: { user: { status: { in: ['ACTIVE', 'SUSPENDED'] } } } } } } }, orderBy: { createdAt: 'asc' } });
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

  // ---- Staff and invitations: the owner's alone (spec §13 as decided by the owner, 2026-10-14) ----

  /** Everyone working in the panel and every open invitation, with what the owner may do to each. */
  @RequirePermissions('users.manage')
  @Get('staff')
  async staff(@CurrentActor() actor: Actor) {
    assertOwner(actor);
    // Erased accounts keep only an anonymous row for history and trashed ones are under the trash tab; neither is listed here.
    const rows = await this.prisma.user.findMany({ where: { kind: 'STAFF', status: { in: ['ACTIVE', 'SUSPENDED'] } }, include: { roles: { include: { role: true } } }, orderBy: { createdAt: 'asc' } });
    const activeOwners = rows.filter((u) => u.status === 'ACTIVE' && u.roles.some((r) => r.role.isOwner)).length;
    const staff: StaffMemberView[] = rows.map((u) => ({
      id: u.id, email: u.email, fullName: u.fullName, phone: u.contactPhone, status: u.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      mfaEnabled: !!u.mfaEnabledAt, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      roles: u.roles.map((r) => ({ id: r.roleId, key: r.role.key, nameFa: r.role.nameFa, nameEn: r.role.nameEn, isOwner: r.role.isOwner })),
      isSelf: u.id === actor.userId,
      // The same rules are enforced by the trash endpoint: never oneself, never the last active owner.
      canTrash: u.id !== actor.userId && !(u.status === 'ACTIVE' && u.roles.some((r) => r.role.isOwner) && activeOwners <= 1),
    }));
    return { staff, invitations: await this.invitations.list(), mailConfigured: this.mail.configured, trashCount: await this.staffTrash.count() };
  }

  /** Invitation by e-mail (queued for the worker) with the one-time link also returned once to the inviting owner. */
  @RequirePermissions('users.manage')
  @Post('staff/invitations')
  @ApiZodBody(staffInviteSchema)
  invite(@CurrentActor() actor: Actor, @Body(zod(staffInviteSchema)) body: z.infer<typeof staffInviteSchema>) {
    assertOwner(actor);
    return this.invitations.invite(actor, body);
  }

  /** Edits an invitation that was not accepted: e-mail, name, phone and roles. */
  @RequirePermissions('users.manage')
  @Patch('staff/invitations/:id')
  @ApiZodBody(staffInvitationUpdateSchema)
  updateInvitation(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffInvitationUpdateSchema)) body: z.infer<typeof staffInvitationUpdateSchema>) {
    assertOwner(actor);
    return this.invitations.update(actor, id, body);
  }

  @RequirePermissions('users.manage')
  @Post('staff/invitations/:id/resend')
  @HttpCode(200)
  @ApiZodBody(staffInvitationResendSchema)
  resend(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffInvitationResendSchema)) body: z.infer<typeof staffInvitationResendSchema>) {
    assertOwner(actor);
    return this.invitations.resend(actor, id, body.confirmCode);
  }

  @RequirePermissions('users.manage')
  @Post('staff/invitations/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    assertOwner(actor);
    return this.invitations.revoke(actor, id);
  }

  /** Erases an invitation that never became an account (and any other invitation to that address). */
  @RequirePermissions('users.manage')
  @Post('staff/invitations/:id/erase')
  @HttpCode(200)
  @ApiZodBody(staffEraseSchema)
  eraseInvitation(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffEraseSchema)) body: z.infer<typeof staffEraseSchema>) {
    assertOwner(actor);
    return this.erasure.eraseInvitation(actor, id, body.confirmCode);
  }

  // ---- Trash: «حذف» moves a staff member here; restore or delete for good (owner only) ----

  /** Staff members in the trash, with the days left until the daily job deletes them. */
  @RequirePermissions('users.manage')
  @Get('staff/trash')
  trashList(@CurrentActor() actor: Actor) {
    assertOwner(actor);
    return this.staffTrash.list();
  }

  /** Signs the person out everywhere and blocks sign-in; roles, e-mail and history are kept. */
  @RequirePermissions('users.manage')
  @Post('staff/:id/trash')
  @HttpCode(200)
  moveToTrash(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    assertOwner(actor);
    return this.staffTrash.moveToTrash(actor, id);
  }

  /** Back with the same roles and details; the authenticator is set up again at the next sign-in. */
  @RequirePermissions('users.manage')
  @Post('staff/:id/restore')
  @HttpCode(200)
  restore(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    assertOwner(actor);
    return this.staffTrash.restore(actor, id);
  }

  /** Deletes for good (the complete erasure): personal data, access and invitations go; history stays without a name. */
  @RequirePermissions('users.manage')
  @Post('staff/:id/purge')
  @HttpCode(200)
  @ApiZodBody(trashPurgeSchema)
  purge(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(trashPurgeSchema)) body: z.infer<typeof trashPurgeSchema>) {
    assertOwner(actor);
    return this.staffTrash.purge(actor, id, body.confirmName, body.confirmCode);
  }

  /** Active staff for pickers (assigning a request or a conversation); any staff member may read it. */
  @StaffOnly()
  @Get('staff/options')
  async staffOptions(): Promise<StaffOptionView[]> {
    return this.prisma.user.findMany({ where: { kind: 'STAFF', status: 'ACTIVE' }, select: { id: true, fullName: true, email: true }, orderBy: [{ fullName: 'asc' }, { createdAt: 'asc' }] });
  }

  /**
   * New phone: the staff member's authenticator, recovery codes and sessions are removed; at the
   * next sign-in they set the authenticator up again. Needs the acting owner's own current code.
   */
  @RequirePermissions('users.manage')
  @Post('staff/:id/mfa-reset')
  @HttpCode(200)
  @ApiZodBody(staffMfaResetSchema)
  async resetMfa(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffMfaResetSchema)) body: z.infer<typeof staffMfaResetSchema>) {
    assertOwner(actor);
    if (id === actor.userId) throw forbidden('SELF_EDIT', 'Reset your own authenticator from your account page');
    const target = await this.prisma.user.findFirst({ where: { id, kind: 'STAFF', status: { in: ['ACTIVE', 'SUSPENDED'] } }, select: { id: true, mfaEnabledAt: true } });
    if (!target) throw notFound();
    await this.auth.confirmStepUp(actor, body.confirmCode);
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id }, data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastTimeStep: null } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: id } });
      await tx.mfaChallenge.deleteMany({ where: { userId: id } });
      await this.audit.record(tx, { action: 'staff.mfa_reset', entityType: 'user', entityId: id, before: { mfaEnabled: !!target.mfaEnabledAt }, after: { mfaEnabled: false } });
    });
    // Every session ends now; the next sign-in asks for a new authenticator when the role requires one.
    await this.sessions.revokeAllForUser(id, 'MFA_RESET');
    return { id, mfaReset: true };
  }

  /**
   * Name, phone, roles and active/suspended. Nobody changes their own roles or status here, and
   * there is always at least one active owner. Role changes and suspension end every session.
   */
  @RequirePermissions('users.manage')
  @Patch('staff/:id')
  @ApiZodBody(staffUpdateSchema)
  async update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(staffUpdateSchema)) body: z.infer<typeof staffUpdateSchema>) {
    assertOwner(actor);
    if (id === actor.userId) throw forbidden('SELF_EDIT', 'You cannot change your own roles or status');
    await this.prisma.tx(async (tx) => {
      const target = await tx.user.findFirst({ where: { id, kind: 'STAFF', status: { in: ['ACTIVE', 'SUSPENDED'] } }, include: { roles: { include: { role: { include: { permissions: true } } } } } });
      if (!target) throw notFound();
      const owners = await tx.userRole.findMany({ where: { role: { isOwner: true }, user: { status: 'ACTIVE' } }, select: { userId: true } });
      const ownerIds = owners.map((o) => o.userId);
      const targetIsOwner = target.roles.some((r) => r.role.isOwner);
      if (body.suspended === true && targetIsOwner) assertNotLastOwner(ownerIds, id);
      let newRoleKeys: string[] | undefined;
      if (body.roleIds) {
        const roles = await tx.role.findMany({ where: { id: { in: body.roleIds } }, include: { permissions: true } });
        if (roles.length !== new Set(body.roleIds).size) throw badRequest('UNKNOWN_ROLE');
        assertCanGrant(actor.permissions, roles.flatMap((r) => r.permissions.map((p) => p.permissionKey)));
        if (targetIsOwner && !roles.some((r) => r.isOwner)) assertNotLastOwner(ownerIds, id);
        if (!targetIsOwner && roles.some((r) => r.isOwner)) await this.auth.confirmStepUp(actor, body.confirmCode);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id, grantedById: actor.userId })) });
        newRoleKeys = roles.map((r) => r.key).sort();
      }
      const phone = body.phone === undefined ? undefined : normalizeStaffPhone(body.phone);
      await tx.user.update({
        where: { id },
        data: {
          ...(body.suspended !== undefined ? { status: body.suspended ? 'SUSPENDED' : 'ACTIVE' } : {}),
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(phone !== undefined ? { contactPhone: phone } : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'staff.updated', entityType: 'user', entityId: id,
        before: { fullName: target.fullName, phone: target.contactPhone, roles: target.roles.map((r) => r.role.key).sort(), status: target.status },
        after: {
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(newRoleKeys ? { roles: newRoleKeys } : {}),
          ...(body.suspended !== undefined ? { status: body.suspended ? 'SUSPENDED' : 'ACTIVE' } : {}),
          ...(body.reason ? { reason: body.reason } : {}),
        },
      });
    });
    // A19: role change / suspension ends every session and disconnects live sockets immediately.
    if (body.roleIds || body.suspended !== undefined) await this.sessions.revokeAllForUser(id, body.suspended ? 'SUSPENDED' : 'ROLE_CHANGED');
    return { id };
  }
}

/** Staff management is the owner's alone, checked on every request (not only hidden in the panel). */
function assertOwner(actor: Actor): void {
  if (!actor.isOwner) throw forbidden('OWNER_ONLY', 'Only an owner can manage staff');
}
