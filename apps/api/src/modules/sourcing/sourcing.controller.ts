import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IDEMPOTENCY_HEADER, QUOTE_VERSION_STATUSES, quoteDecisionSchema, quoteDraftSchema, shipmentSchema, sourcingRequestCreateSchema } from '@hedax/contracts';
import { SOURCING_REQUEST_STATES, PROCUREMENT_STATES } from '@hedax/domain';
import { z } from 'zod';
import { CurrentActor, CustomerOnly, RequirePermissions, StaffOnly } from '../../common/auth/decorators.js';
import { forbidden } from '../../common/errors.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { ProcurementService } from './procurement.service.js';
import { QuotesService } from './quotes.service.js';
import { SourcingService } from './sourcing.service.js';

const transitionSchema = z.object({ toState: z.enum(SOURCING_REQUEST_STATES), reason: z.string().max(1000).optional(), version: z.number().int().min(0) });
const assignSchema = z.object({ assigneeId: z.uuid().nullable() });
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(1000) });
const procTransitionSchema = z.object({
  toState: z.enum(PROCUREMENT_STATES), reason: z.string().max(1000).optional(), version: z.number().int().min(0), shipment: shipmentSchema.optional(),
});
const estimateSchema = z.object({ field: z.enum(['READY', 'DELIVERY']), newEstimate: z.iso.datetime(), reason: z.string().trim().min(5).max(1000) });
const itemUpdateSchema = z.object({
  status: z.enum(['PENDING', 'SOURCING', 'PURCHASED', 'RECEIVED', 'UNAVAILABLE']).optional(),
  supplierId: z.uuid().nullable().optional(),
  supplierOrderRef: z.string().max(80).nullable().optional(),
  unitCost: z.object({ currency: z.enum(['IRR', 'AED']), amountMinor: z.string().regex(/^\d+$/) }).nullable().optional(),
  internalNote: z.string().max(1000).nullable().optional(),
});
const supplierSchema = z.object({
  name: z.string().trim().min(2).max(200), country: z.string().length(2).toUpperCase().optional().nullable(), city: z.string().max(80).optional().nullable(),
  contact: z.string().max(300).optional().nullable(), notes: z.string().max(2000).optional().nullable(),
});

@ApiTags('sourcing, quotes & procurement')
@Controller()
export class SourcingController {
  constructor(
    private readonly sourcing: SourcingService,
    private readonly quotes: QuotesService,
    private readonly procurement: ProcurementService,
    private readonly prisma: PrismaService,
  ) {}

  // ---- Customer ----

  @CustomerOnly()
  @Post('sourcing-requests')
  @ApiZodBody(sourcingRequestCreateSchema)
  create(@CurrentActor() actor: Actor, @Body(zod(sourcingRequestCreateSchema)) body: z.infer<typeof sourcingRequestCreateSchema>) {
    return this.sourcing.create(actor, body);
  }

  @CustomerOnly()
  @Get('sourcing-requests')
  mine(@CurrentActor() actor: Actor) {
    return this.sourcing.listForCustomer(actor);
  }

  @CustomerOnly()
  @Get('sourcing-requests/:id')
  one(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sourcing.getForCustomer(actor, id);
  }

  @CustomerOnly()
  @Post('sourcing-requests/:id/cancel')
  async cancelOwn(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(cancelSchema.extend({ version: z.number().int().min(0) }))) body: { reason: string; version: number }) {
    return this.sourcing.transition(actor, id, 'CANCELLED', body.reason, body.version);
  }

  @CustomerOnly()
  @Get('quotes/:versionId')
  quote(@CurrentActor() actor: Actor, @Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.quotes.viewForCustomer(actor, versionId);
  }

  /** Explicit accept/reject of the exact version shown. Accepting ≠ paying. */
  @CustomerOnly()
  @Post('quote-acceptance')
  @ApiZodBody(quoteDecisionSchema)
  decide(@CurrentActor() actor: Actor, @Body(zod(quoteDecisionSchema)) body: z.infer<typeof quoteDecisionSchema>) {
    return this.quotes.decide(actor, {
      decision: body.decision, quoteVersionId: body.quoteVersionId, versionNumber: body.versionNumber,
      ...(body.rejectReason ? { rejectReason: body.rejectReason } : {}),
      ...(body.includedItemIds ? { includedItemIds: body.includedItemIds } : {}),
    });
  }

  @CustomerOnly()
  @Post('procurements/:id/pay')
  pay(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Headers(IDEMPOTENCY_HEADER.toLowerCase()) key: string | undefined) {
    return this.quotes.pay(actor, id, key);
  }

  @CustomerOnly()
  @Get('procurements')
  procurements(@CurrentActor() actor: Actor) {
    return this.procurement.listForCustomer(actor);
  }

  @CustomerOnly()
  @Get('procurements/:id')
  procurementOne(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.getForCustomer(actor, id);
  }

  // ---- Staff ----

  @StaffOnly()
  @Get('admin/sourcing-requests')
  staffList(@CurrentActor() actor: Actor, @Query('status') status?: string) {
    const parsed = z.enum(SOURCING_REQUEST_STATES).optional().parse(status || undefined);
    return this.sourcing.listForStaff(actor, parsed);
  }

  @StaffOnly()
  @Get('admin/sourcing-requests/:id')
  staffOne(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.sourcing.getForStaff(actor, id);
  }

  @RequirePermissions('sourcing.assign')
  @Put('admin/sourcing-requests/:id/assignee')
  assign(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(assignSchema)) body: z.infer<typeof assignSchema>) {
    return this.sourcing.assign(actor, id, body.assigneeId);
  }

  @RequirePermissions('sourcing.write')
  @Post('admin/sourcing-requests/:id/transition')
  transition(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(transitionSchema)) body: z.infer<typeof transitionSchema>) {
    return this.sourcing.transition(actor, id, body.toState, body.reason, body.version);
  }

  @RequirePermissions('quotes.write')
  @Put('admin/sourcing-requests/:id/quote-draft')
  @ApiZodBody(quoteDraftSchema)
  saveDraft(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(quoteDraftSchema)) body: z.infer<typeof quoteDraftSchema>) {
    return this.quotes.saveDraft(actor, id, body);
  }

  @RequirePermissions('quotes.write')
  @Get('admin/quotes')
  staffQuotes(@CurrentActor() actor: Actor, @Query('status') status?: string) {
    return this.quotes.listForStaff(actor, z.enum(QUOTE_VERSION_STATUSES).optional().parse(status || undefined));
  }

  @RequirePermissions('quotes.write')
  @Get('admin/quotes/:versionId')
  staffQuote(@CurrentActor() actor: Actor, @Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.quotes.viewForStaff(actor, versionId);
  }

  @RequirePermissions('quotes.publish')
  @Post('admin/quotes/:versionId/send')
  send(@CurrentActor() actor: Actor, @Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.quotes.send(actor, versionId);
  }

  @RequirePermissions('quotes.publish')
  @Post('admin/quotes/:versionId/cancel')
  cancel(@CurrentActor() actor: Actor, @Param('versionId', ParseUUIDPipe) versionId: string, @Body(zod(cancelSchema)) body: z.infer<typeof cancelSchema>) {
    return this.quotes.cancel(actor, versionId, body.reason);
  }

  @RequirePermissions('procurement.read')
  @Get('admin/procurements')
  staffProcurements(@Query('status') status?: string) {
    return this.procurement.listForStaff(z.enum(PROCUREMENT_STATES).optional().parse(status || undefined));
  }

  @RequirePermissions('procurement.read')
  @Get('admin/procurements/:id')
  staffProcurement(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.procurement.getForStaff(actor, id);
  }

  @RequirePermissions('procurement.write')
  @Post('admin/procurements/:id/transition')
  procTransition(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(procTransitionSchema)) body: z.infer<typeof procTransitionSchema>) {
    if (['CANCELLED'].includes(body.toState) && !actor.permissions.has('orders.manage')) throw forbidden('MISSING_PERMISSION', 'Missing permission: orders.manage');
    return this.procurement.transition(id, body.toState, body.reason, body.version, body.shipment ? {
      shippingMethodId: body.shipment.shippingMethodId,
      ...(body.shipment.trackingCode ? { trackingCode: body.shipment.trackingCode } : {}),
      ...(body.shipment.carrierCode ? { carrierCode: body.shipment.carrierCode } : {}),
    } : undefined);
  }

  @RequirePermissions('procurement.write')
  @Post('admin/procurements/:id/estimate')
  estimate(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(estimateSchema)) body: z.infer<typeof estimateSchema>) {
    return this.procurement.changeEstimate(id, { field: body.field, newEstimate: new Date(body.newEstimate), reason: body.reason }, actor.userId);
  }

  @RequirePermissions('procurement.write')
  @Patch('admin/procurements/:id/items/:itemId')
  updateItem(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(zod(itemUpdateSchema)) body: z.infer<typeof itemUpdateSchema>) {
    if (body.unitCost !== undefined && !actor.permissions.has('costs.read')) throw forbidden('MISSING_PERMISSION', 'Missing permission: costs.read');
    return this.procurement.updateItem(id, itemId, body);
  }

  @RequirePermissions('procurement.read')
  @Get('admin/suppliers')
  suppliers() {
    return this.prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  @RequirePermissions('procurement.write')
  @Post('admin/suppliers')
  createSupplier(@Body(zod(supplierSchema)) body: z.infer<typeof supplierSchema>) {
    return this.prisma.supplier.create({ data: { name: body.name, country: body.country ?? null, city: body.city ?? null, contact: body.contact ?? null, notes: body.notes ?? null } });
  }
}
