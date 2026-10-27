import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { assistantConversationQuerySchema, assistantMessageSchema } from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, OptionalActor, Public, RequirePermissions } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { currentContext } from '../../common/request-context.js';
import { LIMITS, RateLimitService } from '../../common/rate-limit.service.js';
import { zod } from '../../common/zod.js';
import { AssistantLogService } from './assistant-log.service.js';
import { AssistantService } from './assistant.service.js';

@Controller()
export class AssistantController {
  constructor(private readonly assistant: AssistantService, private readonly log: AssistantLogService, private readonly limits: RateLimitService) {}
  @Public() @Post('assistant/messages') async message(@Body(zod(assistantMessageSchema)) body: z.infer<typeof assistantMessageSchema>, @OptionalActor() actor: Actor | null) { await this.limit(actor); return this.assistant.message(body, actor); }
  @RequirePermissions('settings.manage') @Get('admin/assistant/status') status() { return this.assistant.status(); }

  /** The guide's conversation log (newest first), searchable by question or answer text. */
  @RequirePermissions('settings.manage') @Get('admin/assistant/conversations')
  conversations(@Query(zod(assistantConversationQuerySchema)) query: z.infer<typeof assistantConversationQuerySchema>) { return this.log.list(query); }

  @RequirePermissions('settings.manage') @Get('admin/assistant/conversations/:id')
  conversation(@Param('id', ParseUUIDPipe) id: string) { return this.log.get(id); }

  @RequirePermissions('settings.manage') @Delete('admin/assistant/conversations/:id')
  removeConversation(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) { return this.log.remove(id, actor.userId); }

  private limit(actor: Actor | null) { return this.limits.hit(LIMITS.assistantPerIp, actor?.userId ?? currentContext()?.ipHash); }
}
