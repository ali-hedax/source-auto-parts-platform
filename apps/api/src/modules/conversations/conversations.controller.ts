import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { cursorQuerySchema, internalNoteSchema, markReadSchema, sendMessageSchema, startSupportConversationSchema } from '@hedax/contracts';
import { z } from 'zod';
import { CurrentActor, CustomerOnly, RequirePermissions } from '../../common/auth/decorators.js';
import type { Actor } from '../../common/request-context.js';
import { ApiZodBody, zod } from '../../common/zod.js';
import { ConversationsService } from './conversations.service.js';

const historyQuery = cursorQuerySchema.extend({ after: z.uuid().optional() });
const assignSchema = z.object({ assigneeId: z.uuid().nullable() });

/** REST side of chat: history, send (also available over WebSocket), read cursors, notes. */
@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.conversations.list(actor);
  }

  @CustomerOnly()
  @Post('support')
  @ApiZodBody(startSupportConversationSchema)
  startSupport(@CurrentActor() actor: Actor, @Body(zod(startSupportConversationSchema)) body: z.infer<typeof startSupportConversationSchema>) {
    return this.conversations.startSupport(actor, body);
  }

  @Get(':id')
  async get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.conversations.getAuthorized(actor, id);
    return { id: c.id, subject: c.subject, subjectKind: c.subjectKind, subjectId: c.subjectId, closedAt: c.closedAt?.toISOString() ?? null };
  }

  @Get(':id/messages')
  history(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query(zod(historyQuery)) q: z.infer<typeof historyQuery>) {
    return this.conversations.history(actor, id, { limit: q.limit, ...(q.cursor ? { cursor: q.cursor } : {}), ...(q.after ? { after: q.after } : {}) });
  }

  @Post(':id/messages')
  @ApiZodBody(sendMessageSchema)
  send(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() raw: Record<string, unknown>) {
    const body = sendMessageSchema.parse({ ...raw, conversationId: id });
    return this.conversations.send(actor, body);
  }

  @Post(':id/read')
  async read(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() raw: Record<string, unknown>) {
    const body = markReadSchema.parse({ ...raw, conversationId: id });
    await this.conversations.markRead(actor, id, body.lastReadMessageId);
    return { ok: true };
  }

  @RequirePermissions('conversations.write')
  @Get(':id/notes')
  notes(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.notes(actor, id);
  }

  @RequirePermissions('notes.write')
  @Post(':id/notes')
  addNote(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(zod(internalNoteSchema)) body: z.infer<typeof internalNoteSchema>) {
    return this.conversations.addNote(actor, id, body.body);
  }

  @RequirePermissions('sourcing.assign')
  @Put(':id/assignee')
  async assign(@Param('id', ParseUUIDPipe) id: string, @Body(zod(assignSchema)) body: z.infer<typeof assignSchema>) {
    await this.conversations.assign(id, body.assigneeId);
    return { ok: true };
  }
}
