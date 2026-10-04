import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { cartItemSchema, cartItemUpdateSchema } from '@hedax/contracts';
import { z } from 'zod';
import { OptionalActor, Public } from '../../common/auth/decorators.js';
import { notFound } from '../../common/errors.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { CartService } from './cart.service.js';

const displayQuery = z.object({ currency: z.enum(['IRR', 'AED']).default('IRR') });

/** Cart endpoints work for guests (cookie) and customers; responses are never cached. */
@ApiTags('cart')
@Public()
@Controller('cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get()
  async get(@Req() req: Request, @Res({ passthrough: true }) res: Response, @OptionalActor() actor: Actor | null, @Query(zod(displayQuery)) q: z.infer<typeof displayQuery>) {
    res.setHeader('Cache-Control', 'private, no-store');
    const cart = await this.carts.resolveCart(actor, req, null, false);
    return this.carts.view(cart?.id ?? null, actor, q.currency);
  }

  @Post('items')
  @ApiZodBody(cartItemSchema)
  async add(@Req() req: Request, @Res({ passthrough: true }) res: Response, @OptionalActor() actor: Actor | null, @Body(zod(cartItemSchema)) body: z.infer<typeof cartItemSchema>) {
    res.setHeader('Cache-Control', 'private, no-store');
    const cart = await this.carts.resolveCart(actor, req, res, true);
    if (!cart) throw notFound();
    await this.carts.add(cart.id, body.productId, body.quantity);
    return this.carts.view(cart.id, actor, 'IRR');
  }

  @Patch('items/:id')
  async update(
    @Req() req: Request,
    @OptionalActor() actor: Actor | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zod(cartItemUpdateSchema)) body: z.infer<typeof cartItemUpdateSchema>,
  ) {
    const cart = await this.carts.resolveCart(actor, req, null, false);
    if (!cart) throw notFound();
    await this.carts.setQuantity(cart.id, id, body.quantity);
    return this.carts.view(cart.id, actor, 'IRR');
  }

  @Delete('items/:id')
  async remove(@Req() req: Request, @OptionalActor() actor: Actor | null, @Param('id', ParseUUIDPipe) id: string) {
    const cart = await this.carts.resolveCart(actor, req, null, false);
    if (!cart) throw notFound();
    await this.carts.setQuantity(cart.id, id, 0);
    return this.carts.view(cart.id, actor, 'IRR');
  }
}
