import { Body, Controller, Get, Headers, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IDEMPOTENCY_HEADER, refundCreateSchema, returnDecisionSchema, returnRequestSchema } from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, CustomerOnly, RequirePermissions } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ReturnsService } from './returns.service.js';

const receiveSchema = z.object({
  items: z.array(z.object({ itemId: z.uuid(), receivedQuantity: z.number().int().min(0), restockQuantity: z.number().int().min(0), inspectionNote: z.string().max(1000).optional() })).min(1),
});
const refundDecisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(1000).optional() });
const executeSchema = z.object({ manualReference: z.string().trim().min(4).max(120).optional() });

@ApiTags('returns & refunds')
@Controller()
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @CustomerOnly()
  @Post('returns')
  @ApiZodBody(returnRequestSchema)
  create(@CurrentActor() actor: Actor, @Body(zod(returnRequestSchema)) body: z.infer<typeof returnRequestSchema>) {
    return this.returns.createRequest(actor, body);
  }

  @CustomerOnly()
  @Get('returns')
  mine(@CurrentActor() actor: Actor) {
    return this.returns.listForCustomer(actor);
  }

  @RequirePermissions('returns.manage')
  @Get('admin/returns')
  staffList() {
    return this.returns.listForStaff();
  }

  @RequirePermissions('returns.manage')
  @Post('admin/returns/:id/decision')
  decide(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(returnDecisionSchema)) body: z.infer<typeof returnDecisionSchema>) {
    return this.returns.decide(id, body.decision, body.reason, actor.userId);
  }

  @RequirePermissions('returns.manage', 'inventory.adjust')
  @Post('admin/returns/:id/receive')
  receive(@Param('id', ParseUUIDPipe) id: string, @Body(zod(receiveSchema)) body: z.infer<typeof receiveSchema>) {
    return this.returns.receive(id, body.items.map((i) => ({ itemId: i.itemId, receivedQuantity: i.receivedQuantity, restockQuantity: i.restockQuantity, ...(i.inspectionNote ? { inspectionNote: i.inspectionNote } : {}) })));
  }

  @RequirePermissions('payments.read')
  @Get('admin/refunds')
  refunds() {
    return this.returns.refunds();
  }

  @RequirePermissions('payments.refund')
  @Post('admin/refunds')
  @ApiZodBody(refundCreateSchema)
  createRefund(@CurrentActor() actor: Actor, @Headers(IDEMPOTENCY_HEADER.toLowerCase()) key: string | undefined, @Body(zod(refundCreateSchema)) body: z.infer<typeof refundCreateSchema>) {
    return this.returns.createRefund(actor, {
      ...(body.paymentAttemptId ? { paymentAttemptId: body.paymentAttemptId } : {}),
      ...(body.paymentReference ? { paymentReference: body.paymentReference } : {}),
      amountIrr: body.amountIrr, reason: body.reason,
      ...(body.returnRequestId ? { returnRequestId: body.returnRequestId } : {}),
    }, key);
  }

  @RequirePermissions('payments.refund')
  @Post('admin/refunds/:id/decision')
  decideRefund(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(refundDecisionSchema)) body: z.infer<typeof refundDecisionSchema>) {
    return this.returns.decideRefund(actor, id, body.decision, body.reason);
  }

  @RequirePermissions('payments.refund')
  @Post('admin/refunds/:id/execute')
  execute(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(executeSchema)) body: z.infer<typeof executeSchema>) {
    return this.returns.executeRefund(actor, id, body.manualReference);
  }
}

@Module({
  imports: [AttachmentsModule, InventoryModule, PaymentsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
