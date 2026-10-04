import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { SESSION_COOKIE, SOCKET_EVENTS, sendMessageSchema } from '@hedax/contracts';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env.js';
import { SessionService } from '../../common/auth/session.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RealtimeBus, type BusEvent } from '../../common/realtime-bus.js';
import { runWithContext, type Actor } from '../../common/request-context.js';
import { ConversationsService } from './conversations.service.js';

type HedaxSocket = Socket & { data: { actor?: Actor; token?: string } };
const joinSchema = z.object({ conversationId: z.uuid() });
const resyncSchema = z.object({ conversationId: z.uuid(), afterMessageId: z.uuid().optional() });
const REVALIDATE_MS = 60_000;

/**
 * Live transport for chat. The database is the source of truth; the socket
 * only carries events. Authorization is checked on connect, join, send and
 * resync, and again whenever sessions/roles/assignments change (A17, A19).
 */
@WebSocketGateway({ path: '/api/v1/ws', serveClient: false, cors: false, transports: ['websocket', 'polling'] })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private readonly allowedOrigins: Set<string>;
  private unsubscribe: (() => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private closing = false;

  constructor(
    private readonly sessions: SessionService,
    private readonly conversations: ConversationsService,
    private readonly prisma: PrismaService,
    private readonly bus: RealtimeBus,
    @Inject(ENV) env: Env,
  ) {
    this.allowedOrigins = new Set([env.PUBLIC_BASE_URL, ...env.ALLOWED_ORIGINS.split(',')].map((o) => o.trim().replace(/\/$/, '')).filter(Boolean));
  }

  afterInit(server: Server): void {
    // Authenticate in the handshake middleware: the connection is accepted only
    // after the session is resolved, so no event can arrive before the actor is
    // known (a join sent right after "connect" used to race the async check).
    server.use((socket, next) => {
      this.authenticate(socket as HedaxSocket).then(
        (code) => next(code ? Object.assign(new Error(code), { data: { code } }) : undefined),
        () => next(Object.assign(new Error('UNAUTHENTICATED'), { data: { code: 'UNAUTHENTICATED' } })),
      );
    });
    this.unsubscribe = this.bus.on((e) => {
      if (this.closing) return;
      void this.onBusEvent(e).catch((err: unknown) => this.logger.warn(`bus handler: ${String(err)}`));
    });
    this.timer = setInterval(() => void this.revalidateAll(), REVALIDATE_MS);
  }

  onModuleDestroy(): void {
    this.closing = true;
    this.unsubscribe?.();
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns an error code when the handshake must be refused, null when the socket may connect. */
  private async authenticate(socket: HedaxSocket): Promise<string | null> {
    const origin = (socket.handshake.headers.origin ?? '').replace(/\/$/, '');
    if (origin && !this.allowedOrigins.has(origin)) return 'ORIGIN_NOT_ALLOWED';
    const token = parseCookie(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE];
    const actor = await this.sessions.resolve(token);
    if (!actor || (actor.kind === 'STAFF' && actor.requiresMfa && !actor.mfaVerified)) return 'UNAUTHENTICATED';
    socket.data.actor = actor;
    socket.data.token = token;
    return null;
  }

  async handleConnection(socket: HedaxSocket): Promise<void> {
    const actor = socket.data.actor;
    if (!actor) {
      socket.disconnect(true);
      return;
    }
    await socket.join([`user:${actor.userId}`, `session:${actor.sessionId}`]);
  }

  private actorOf(socket: HedaxSocket): Actor | null {
    return socket.data.actor ?? null;
  }

  private ctx<T>(actor: Actor, fn: () => Promise<T>): Promise<T> {
    return runWithContext({ requestId: `ws-${Date.now().toString(36)}`, ipHash: null, actor }, fn);
  }

  @SubscribeMessage(SOCKET_EVENTS.join)
  async join(@ConnectedSocket() socket: HedaxSocket, @MessageBody() body: unknown) {
    const actor = this.actorOf(socket);
    const parsed = joinSchema.safeParse(body);
    if (!actor || !parsed.success) return { ok: false, code: 'BAD_REQUEST' };
    const conv = await this.prisma.conversation.findUnique({ where: { id: parsed.data.conversationId } });
    // Knowing a room id is not a permission: access is checked against the DB every time.
    if (!conv || !this.conversations.canRead(actor, conv)) return { ok: false, code: 'NOT_FOUND' };
    await socket.join(`conv:${conv.id}`);
    return { ok: true };
  }

  @SubscribeMessage(SOCKET_EVENTS.leave)
  async leave(@ConnectedSocket() socket: HedaxSocket, @MessageBody() body: unknown) {
    const parsed = joinSchema.safeParse(body);
    if (parsed.success) await socket.leave(`conv:${parsed.data.conversationId}`);
    return { ok: true };
  }

  /** Acknowledged only after the message is stored; retries with the same clientMessageId are deduplicated. */
  @SubscribeMessage(SOCKET_EVENTS.send)
  async send(@ConnectedSocket() socket: HedaxSocket, @MessageBody() body: unknown) {
    const actor = this.actorOf(socket);
    if (!actor) return { ok: false, code: 'UNAUTHENTICATED' };
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED' };
    try {
      const message = await this.ctx(actor, () => this.conversations.send(actor, parsed.data));
      return { ok: true, message };
    } catch (e) {
      const code = (e as { code?: string; response?: { code?: string } }).response?.code ?? 'SEND_FAILED';
      return { ok: false, code };
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.resync)
  async resync(@ConnectedSocket() socket: HedaxSocket, @MessageBody() body: unknown) {
    const actor = this.actorOf(socket);
    const parsed = resyncSchema.safeParse(body);
    if (!actor || !parsed.success) return { ok: false, code: 'BAD_REQUEST' };
    try {
      const page = await this.conversations.history(actor, parsed.data.conversationId, {
        limit: 100,
        ...(parsed.data.afterMessageId ? { after: parsed.data.afterMessageId } : {}),
      });
      return { ok: true, items: page.items };
    } catch {
      return { ok: false, code: 'NOT_FOUND' };
    }
  }

  private async onBusEvent(event: BusEvent): Promise<void> {
    if (!this.server) return;
    switch (event.type) {
      case 'message.created': {
        const sockets = (await this.server.in(`conv:${event.conversationId}`).fetchSockets()) as unknown as HedaxSocket[];
        if (!sockets.length) return;
        const row = await this.prisma.message.findUnique({
          where: { id: event.messageId },
          include: { sender: { select: { id: true, fullName: true, kind: true } }, attachments: { include: { attachment: true } } },
        });
        const conv = await this.prisma.conversation.findUnique({ where: { id: event.conversationId } });
        if (!row || !conv) return;
        for (const s of sockets) {
          const actor = s.data.actor;
          if (!actor || !this.conversations.canRead(actor, conv)) {
            s.leave(`conv:${conv.id}`);
            continue;
          }
          s.emit(SOCKET_EVENTS.message, await this.conversations.toMessageView(row, actor));
        }
        return;
      }
      case 'session.revoked': {
        for (const id of event.sessionIds) {
          this.server.to(`session:${id}`).emit(SOCKET_EVENTS.revoked, {});
          this.server.in(`session:${id}`).disconnectSockets(true);
        }
        return;
      }
      case 'user.auth-changed': {
        const sockets = (await this.server.in(`user:${event.userId}`).fetchSockets()) as unknown as HedaxSocket[];
        for (const s of sockets) await this.revalidate(s);
        return;
      }
      case 'conversation.access-changed': {
        const conv = await this.prisma.conversation.findUnique({ where: { id: event.conversationId } });
        const sockets = (await this.server.in(`conv:${event.conversationId}`).fetchSockets()) as unknown as HedaxSocket[];
        for (const s of sockets) if (!conv || !s.data.actor || !this.conversations.canRead(s.data.actor, conv)) s.leave(`conv:${event.conversationId}`);
        return;
      }
    }
  }

  /** Re-resolves the session; drops the socket if revoked/suspended, refreshes permissions otherwise. */
  private async revalidate(socket: HedaxSocket): Promise<void> {
    const actor = await this.sessions.resolve(socket.data.token);
    if (!actor) {
      socket.emit(SOCKET_EVENTS.revoked, {});
      socket.disconnect(true);
      return;
    }
    socket.data.actor = actor;
    for (const room of socket.rooms) {
      if (!room.startsWith('conv:')) continue;
      const conv = await this.prisma.conversation.findUnique({ where: { id: room.slice(5) } });
      if (!conv || !this.conversations.canRead(actor, conv)) await socket.leave(room);
    }
  }

  private async revalidateAll(): Promise<void> {
    if (!this.server || this.closing) return;
    const sockets = (await this.server.fetchSockets()) as unknown as HedaxSocket[];
    for (const s of sockets) await this.revalidate(s).catch(() => undefined);
  }
}
