import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { operatorListQuerySchema, operatorReplySchema, operatorRequestSchema, operatorStatusSchema, operatorVisitorMessageSchema } from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, CustomerOnly, OptionalActor, Public, RequirePermissions } from '../../common/auth/decorators.js';
import { currentContext, type Actor } from '../../common/request-context.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import { zod } from '../../common/zod.js';
import { OperatorService } from './operator.service.js';

const keyQuery = z.object({ key: z.string().min(20).max(100) });

@Controller()
export class OperatorController {
  constructor(private readonly operator: OperatorService, private readonly limits: RateLimitService) {}

  /** A visitor (guest or signed-in customer) leaves a message for an operator from the guide. */
  @Public() @Post('assistant/operator')
  async create(@Body(zod(operatorRequestSchema)) body: z.infer<typeof operatorRequestSchema>, @OptionalActor() actor: Actor | null) {
    const ipHash = currentContext()?.ipHash ?? null;
    await this.limits.hit(LIMITS.operatorPerIp, actor?.userId ?? ipHash);
    return this.operator.create(body, { userId: actor?.kind === 'CUSTOMER' ? actor.userId : null, ipHash });
  }

  @Public() @Get('assistant/operator/:id')
  thread(@Param('id', ParseUUIDPipe) id: string, @Query(zod(keyQuery)) q: z.infer<typeof keyQuery>) { return this.operator.thread(id, q.key); }

  @Public() @Post('assistant/operator/:id/messages')
  async visitorMessage(@Param('id', ParseUUIDPipe) id: string, @Body(zod(operatorVisitorMessageSchema)) body: z.infer<typeof operatorVisitorMessageSchema>) {
    await this.limits.hit(LIMITS.operatorPerIp, currentContext()?.ipHash ?? id);
    return this.operator.visitorMessage(id, body.key, body.message);
  }

  @CustomerOnly() @Get('account/operator-requests')
  mine(@CurrentActor() actor: Actor) { return this.operator.forCustomer(actor.userId); }

  @RequirePermissions('conversations.write') @Get('admin/operator-requests')
  list(@Query(zod(operatorListQuerySchema)) q: z.infer<typeof operatorListQuerySchema>) { return this.operator.list(q); }

  @RequirePermissions('conversations.write') @Get('admin/operator-requests/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.operator.detail(id); }

  @RequirePermissions('conversations.write') @Post('admin/operator-requests/:id/reply')
  reply(@Param('id', ParseUUIDPipe) id: string, @Body(zod(operatorReplySchema)) body: z.infer<typeof operatorReplySchema>, @CurrentActor() actor: Actor) { return this.operator.reply(id, body.message, actor.userId); }

  @RequirePermissions('conversations.write') @Post('admin/operator-requests/:id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body(zod(operatorStatusSchema)) body: z.infer<typeof operatorStatusSchema>) { return this.operator.setStatus(id, body.status); }
}
