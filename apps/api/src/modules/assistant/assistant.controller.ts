import { Body, Controller, Get, Post } from '@nestjs/common';
import { assistantMessageSchema } from '@hedax/contracts';
import { z } from 'zod';
import { OptionalActor, Public, RequirePermissions } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { currentContext } from '../../common/request-context.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import { zod } from '../../common/zod.js';
import { AssistantService } from './assistant.service.js';

@Controller()
export class AssistantController {
  constructor(private readonly assistant: AssistantService, private readonly limits: RateLimitService) {}
  @Public() @Post('assistant/messages') async message(@Body(zod(assistantMessageSchema)) body: z.infer<typeof assistantMessageSchema>, @OptionalActor() actor: Actor | null) { await this.limit(actor); return this.assistant.message(body, actor); }
  @RequirePermissions('settings.manage') @Get('admin/assistant/status') status() { return this.assistant.status(); }
  private limit(actor: Actor | null) { return this.limits.hit(LIMITS.assistantPerIp, actor?.userId ?? currentContext()?.ipHash); }
}
