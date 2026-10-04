import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IDEMPOTENCY_HEADER, checkoutStartSchema, orderTransitionSchema, shipmentSchema } from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, CustomerOnly, RequirePermissions } from '../../common/auth/decorators.js';
import { forbidden } from '../../common/errors.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { CheckoutService } from './checkout.service.js';
import { OrdersService } from './orders.service.js';

const previewQuery = z.object({
  addressId: z.uuid().optional(),
  shippingMethodId: z.uuid().optional(),
  currency: z.enum(['IRR', 'AED']).default('IRR'),
});
const adminTransitionSchema = orderTransitionSchema.extend({ shipment: shipmentSchema.optional() });
const statusQuery = z.object({
  status: z.enum(['AWAITING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXCEPTION']).optional(),
});

@ApiTags('checkout & orders')
@Controller()
export class OrdersController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

  /** Requires a signed-in customer; browsing and cart work without an account. Always fresh (no cache). */
  @CustomerOnly()
  @Get('checkout/preview')
  preview(@CurrentActor() actor: Actor, @Req() req: Request, @Query(zod(previewQuery)) q: z.infer<typeof previewQuery>, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.checkout.preview(actor, req, {
      currency: q.currency,
      ...(q.addressId ? { addressId: q.addressId } : {}),
      ...(q.shippingMethodId ? { shippingMethodId: q.shippingMethodId } : {}),
    });
  }

  /**
   * Side effects: order + snapshots, stock reservation, payment attempt, gateway session.
   * Retry behaviour: same Idempotency-Key + same body returns the same redirect.
   */
  @CustomerOnly()
  @Post('checkout')
  @ApiZodBody(checkoutStartSchema)
  start(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Headers(IDEMPOTENCY_HEADER.toLowerCase()) key: string | undefined,
    @Body(zod(checkoutStartSchema)) body: z.infer<typeof checkoutStartSchema>,
  ) {
    return this.checkout.start(actor, req, body, key);
  }

  @CustomerOnly()
  @Post('orders/:id/pay')
  retry(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Headers(IDEMPOTENCY_HEADER.toLowerCase()) key: string | undefined) {
    return this.checkout.retry(actor, id, key);
  }

  @CustomerOnly()
  @Get('orders')
  list(@CurrentActor() actor: Actor) {
    return this.orders.listForCustomer(actor);
  }

  @CustomerOnly()
  @Get('orders/:id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getForCustomer(actor, id);
  }

  @RequirePermissions('orders.read')
  @Get('admin/orders')
  adminList(@Query(zod(statusQuery)) q: z.infer<typeof statusQuery>) {
    return this.orders.listForAdmin(q.status);
  }

  @RequirePermissions('orders.read')
  @Get('admin/orders/:id')
  adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getForAdmin(id);
  }

  /** Fulfilment transitions need orders.fulfil; cancel/exception need orders.manage (checked below). */
  @RequirePermissions('orders.fulfil')
  @Post('admin/orders/:id/transition')
  @ApiZodBody(adminTransitionSchema)
  adminTransition(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(adminTransitionSchema)) body: z.infer<typeof adminTransitionSchema>) {
    if (['CANCELLED', 'EXCEPTION'].includes(body.toState) && !actor.permissions.has('orders.manage')) {
      throw forbidden('MISSING_PERMISSION', 'Missing permission: orders.manage');
    }
    return this.orders.transition(id, {
      toState: body.toState,
      version: body.version,
      ...(body.reason ? { reason: body.reason } : {}),
      ...(body.shipment
        ? {
            shipment: {
              shippingMethodId: body.shipment.shippingMethodId,
              ...(body.shipment.carrierCode ? { carrierCode: body.shipment.carrierCode } : {}),
              ...(body.shipment.trackingCode ? { trackingCode: body.shipment.trackingCode } : {}),
            },
          }
        : {}),
    });
  }
}
