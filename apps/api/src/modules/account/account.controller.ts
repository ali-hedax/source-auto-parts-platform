import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { addressSchema, businessAccountRequestSchema, profileSchema } from '@hedax/contracts';
import { normalizeIranMobile, toAsciiDigits } from '@hedax/domain';
import type { z } from 'zod';
import { AuditService } from '../../common/audit.service.js';
import { CurrentActor, CustomerOnly } from '../../common/auth/decorators.js';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { PrismaService, type Tx } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';

/** Customer profile, addresses and business-account requests. Object access is always scoped to the caller. */
@ApiTags('account')
@CustomerOnly()
@Controller('account')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('profile')
  async profile(@CurrentActor() actor: Actor) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, include: { customerProfile: { include: { customerGroup: true } } } });
    const p = user.customerProfile;
    return {
      fullName: user.fullName,
      email: user.email,
      preferredLocale: user.preferredLocale,
      customerType: p?.customerType ?? 'CONSUMER',
      groupStatus: p?.groupStatus ?? 'NONE',
      requestedType: p?.requestedType ?? null,
      businessName: p?.businessName ?? null,
      companyRole: p?.companyRole ?? null,
      group: p?.customerGroup ? { key: p.customerGroup.key, nameFa: p.customerGroup.nameFa, nameEn: p.customerGroup.nameEn } : null,
    };
  }

  @Put('profile')
  @ApiZodBody(profileSchema)
  async updateProfile(@CurrentActor() actor: Actor, @Body(zod(profileSchema)) body: z.infer<typeof profileSchema>) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.userId },
        data: { fullName: body.fullName, preferredLocale: body.preferredLocale, ...(body.email ? { email: body.email.toLowerCase() } : {}) },
      });
      await tx.customerProfile.update({
        where: { userId: actor.userId },
        data: { businessName: body.companyName ?? null, companyRole: body.companyRole ?? null },
      });
    });
    return { saved: true };
  }

  @Get('addresses')
  async addresses(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.address.findMany({ where: { userId: actor.userId, archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
    return rows.map((a) => ({
      id: a.id, label: a.label, recipientName: a.recipientName, recipientMobile: a.recipientMobile, province: a.province,
      city: a.city, addressLine: a.addressLine, postalCode: a.postalCode, isDefault: a.isDefault,
    }));
  }

  private normalizeAddress(body: z.infer<typeof addressSchema>) {
    const mobile = normalizeIranMobile(body.recipientMobile);
    if (!mobile.ok) throw badRequest('INVALID_MOBILE', 'Enter a valid Iranian mobile number');
    return {
      label: body.label ?? null,
      recipientName: body.recipientName,
      recipientMobile: mobile.e164,
      province: body.province,
      city: body.city,
      addressLine: body.addressLine,
      postalCode: toAsciiDigits(body.postalCode),
      isDefault: body.isDefault,
    };
  }

  private async clearDefault(tx: Tx, userId: string): Promise<void> {
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }

  @Post('addresses')
  @ApiZodBody(addressSchema)
  async createAddress(@CurrentActor() actor: Actor, @Body(zod(addressSchema)) body: z.infer<typeof addressSchema>) {
    const data = this.normalizeAddress(body);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId: actor.userId, archivedAt: null } });
      if (count >= 20) throw conflict('TOO_MANY_ADDRESSES');
      const makeDefault = data.isDefault || count === 0;
      if (makeDefault) await this.clearDefault(tx, actor.userId);
      const row = await tx.address.create({ data: { ...data, isDefault: makeDefault, userId: actor.userId } });
      return { id: row.id };
    });
  }

  /** Addresses used by orders stay intact: edits create a new row and archive the old one (orders keep snapshots anyway). */
  @Put('addresses/:id')
  async updateAddress(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(addressSchema)) body: z.infer<typeof addressSchema>) {
    const data = this.normalizeAddress(body);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId: actor.userId, archivedAt: null } });
      if (!existing) throw notFound();
      if (data.isDefault) await this.clearDefault(tx, actor.userId);
      await tx.address.update({ where: { id }, data: { archivedAt: new Date(), isDefault: false } });
      const row = await tx.address.create({ data: { ...data, userId: actor.userId } });
      return { id: row.id };
    });
  }

  @Delete('addresses/:id')
  async archiveAddress(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    const res = await this.prisma.address.updateMany({ where: { id, userId: actor.userId, archivedAt: null }, data: { archivedAt: new Date(), isDefault: false } });
    if (res.count !== 1) throw notFound();
    return { archived: true };
  }

  /**
   * Requests a workshop/wholesale account. Grants nothing until an authorized
   * staff member approves it (self-declaration never unlocks group prices).
   */
  @Post('business-request')
  @ApiZodBody(businessAccountRequestSchema)
  async businessRequest(@CurrentActor() actor: Actor, @Body(zod(businessAccountRequestSchema)) body: z.infer<typeof businessAccountRequestSchema>) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.customerProfile.findUniqueOrThrow({ where: { userId: actor.userId } });
      if (profile.groupStatus === 'PENDING') throw conflict('REQUEST_PENDING', 'A request is already under review');
      if (body.attachmentIds.length) {
        const owned = await tx.attachment.count({ where: { id: { in: body.attachmentIds }, ownerId: actor.userId, deletedAt: null } });
        if (owned !== body.attachmentIds.length) throw notFound();
        await tx.attachment.updateMany({ where: { id: { in: body.attachmentIds } }, data: { subjectType: 'BUSINESS_VERIFICATION', subjectId: actor.userId } });
      }
      await tx.customerProfile.update({
        where: { userId: actor.userId },
        data: { requestedType: body.requestedType, groupStatus: 'PENDING', businessName: body.businessName, businessCity: body.city, businessNote: body.note ?? null },
      });
      await this.audit.record(tx, { action: 'customer.business_request', entityType: 'customer', entityId: actor.userId, after: { requestedType: body.requestedType } });
      return { status: 'PENDING' };
    });
  }
}
