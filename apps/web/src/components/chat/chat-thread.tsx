'use client';

import type { CursorPage, MessageView } from '@hedax/contracts';
import { SOCKET_EVENTS, systemTextFor } from '@hedax/contracts/constants';
import { AlertCircle, Check, CheckCheck, Clock, FileText, Send, WifiOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { DateTime, useListSeparator } from '@/components/ui/format';
import { Alert, Spinner } from '@/components/ui/misc';
import { FileUploader } from '@/components/files/file-uploader';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

interface Pending {
  clientMessageId: string;
  body: string;
  attachmentIds: string[];
  state: 'sending' | 'failed';
  createdAt: string;
}

const OUTBOX_KEY = (id: string) => `hedax:chat-outbox:${id}`;

function wsUrl(): string | null | undefined {
  const v = process.env.NEXT_PUBLIC_WS_URL;
  if (!v || v === 'off') return null;
  return v === 'same-origin' ? undefined : v;
}

/**
 * Human chat thread (spec §11, A16). The database is the source of truth: a
 * message is shown as sent only after the server stored it. Unsent messages
 * keep their clientMessageId and are retried until acknowledged; the server
 * de-duplicates, so a reconnect never creates a copy. After reconnecting the
 * thread resyncs from the last known message.
 */
export function ChatThread({ conversationId, quoteLinkBase = '/account/quotes', staff = false }: { conversationId: string; quoteLinkBase?: string; staff?: boolean }) {
  const t = useTranslations('chat');
  const tq = useTranslations('quote');
  const locale = useLocale();
  const sep = useListSeparator();
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [connection, setConnection] = useState<'live' | 'offline' | 'polling'>('polling');
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const merge = useCallback((incoming: MessageView[]) => {
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    });
    const confirmed = new Set(incoming.map((m) => m.clientMessageId).filter(Boolean));
    if (confirmed.size) setPending((p) => p.filter((x) => !confirmed.has(x.clientMessageId)));
  }, []);

  // Persist the outbox so unsent messages survive reloads and language switches.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OUTBOX_KEY(conversationId));
      if (raw) setPending((JSON.parse(raw) as Pending[]).map((p) => ({ ...p, state: 'failed' })));
    } catch {
      /* ignore */
    }
  }, [conversationId]);
  useEffect(() => {
    try {
      if (pending.length) localStorage.setItem(OUTBOX_KEY(conversationId), JSON.stringify(pending));
      else localStorage.removeItem(OUTBOX_KEY(conversationId));
    } catch {
      /* ignore */
    }
  }, [pending, conversationId]);

  const loadPage = useCallback(async (before?: string | null) => {
    const res = await api<CursorPage<MessageView>>(`/conversations/${conversationId}/messages?limit=30${before ? `&cursor=${encodeURIComponent(before)}` : ''}`);
    merge(res.items);
    setCursor(res.nextCursor);
    setLoaded(true);
  }, [conversationId, merge]);

  const resync = useCallback(async () => {
    const last = messages[messages.length - 1];
    const res = await api<CursorPage<MessageView>>(`/conversations/${conversationId}/messages?limit=100${last ? `&after=${last.id}` : ''}`).catch(() => null);
    if (res) merge(res.items);
  }, [conversationId, merge, messages]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const deliver = useCallback(async (p: Pending) => {
    setPending((list) => list.map((x) => (x.clientMessageId === p.clientMessageId ? { ...x, state: 'sending' } : x)));
    const payload = { conversationId, clientMessageId: p.clientMessageId, body: p.body, attachmentIds: p.attachmentIds };
    const socket = socketRef.current;
    try {
      let message: MessageView | null = null;
      if (socket?.connected) {
        const ack = (await socket.timeout(10_000).emitWithAck(SOCKET_EVENTS.send, payload).catch(() => null)) as { ok: boolean; message?: MessageView } | null;
        if (ack?.ok && ack.message) message = ack.message;
      }
      message ??= await api<MessageView>(`/conversations/${conversationId}/messages`, { method: 'POST', body: payload });
      merge([message]);
    } catch {
      setPending((list) => list.map((x) => (x.clientMessageId === p.clientMessageId ? { ...x, state: 'failed' } : x)));
    }
  }, [conversationId, merge]);

  // Live transport (optional): join, receive, and resync after reconnects.
  useEffect(() => {
    const url = wsUrl();
    if (url === null) {
      const timer = setInterval(() => void resync(), 10_000);
      return () => clearInterval(timer);
    }
    const socket = io(url, { path: '/api/v1/ws', withCredentials: true, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnection('live');
      // A refused join (no access any more) must not look like a live connection.
      void socket.timeout(10_000).emitWithAck(SOCKET_EVENTS.join, { conversationId }).then(
        (ack: { ok?: boolean } | null) => {
          if (!ack?.ok) setConnection('offline');
        },
        () => setConnection('offline'),
      );
      void resync();
    });
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('connect_error', () => setConnection('offline'));
    socket.on(SOCKET_EVENTS.message, (m: MessageView) => m.conversationId === conversationId && merge([m]));
    socket.on(SOCKET_EVENTS.revoked, () => {
      setConnection('offline');
      socket.disconnect();
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // resync intentionally excluded: the socket lifetime is per conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, merge]);

  // Retry failed messages when the connection comes back (same clientMessageId → no duplicates).
  useEffect(() => {
    if (connection === 'live') pending.filter((p) => p.state === 'failed').forEach((p) => void deliver(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  // Mark as read when the newest message is from someone else.
  const last = messages[messages.length - 1];
  useEffect(() => {
    if (last && !last.sender.isSelf) void api(`/conversations/${conversationId}/read`, { method: 'POST', body: { lastReadMessageId: last.id } }).catch(() => undefined);
  }, [last, conversationId]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, pending.length]);

  const send = () => {
    const text = body.trim();
    if (!text && !files.length) return;
    const p: Pending = { clientMessageId: `c${crypto.randomUUID().replace(/-/g, '')}`, body: text, attachmentIds: files, state: 'sending', createdAt: new Date().toISOString() };
    setPending((list) => [...list, p]);
    setBody('');
    setFiles([]);
    setUploaderKey((k) => k + 1);
    void deliver(p);
  };

  const onFiles = useCallback((ids: string[], busy: boolean) => {
    setFiles(ids);
    setFilesBusy(busy);
  }, []);

  const bubble = (mine: boolean, system: boolean) =>
    system ? 'mx-auto bg-surface text-steel border border-dashed border-line text-sm' : mine ? 'ms-auto bg-action-soft border border-action/20 rounded-se-sm' : 'me-auto bg-white border border-line rounded-ss-sm';

  const rendered = useMemo(() => messages, [messages]);

  return (
    <section aria-labelledby={`chat-${conversationId}`} className="card flex flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-line-soft p-4">
        <h2 id={`chat-${conversationId}`} className="font-bold">{t('title')}</h2>
        {connection === 'offline' ? (
          <span className="flex items-center gap-1 text-sm text-warning" role="status"><WifiOff aria-hidden className="size-4" />{t('disconnected')}</span>
        ) : null}
      </header>
      <div className="max-h-[32rem] min-h-64 overflow-y-auto bg-surface/60 p-4" aria-live="polite" aria-relevant="additions">
        {!loaded ? <Spinner label={t('title')} /> : null}
        {cursor ? (
          <div className="mb-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => void loadPage(cursor)}>{t('loadOlder')}</Button>
          </div>
        ) : null}
        {loaded && !rendered.length && !pending.length ? <p className="text-center text-steel">{t('empty')}</p> : null}
        <ol ref={listRef} className="flex flex-col gap-3">
          {rendered.map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-[var(--radius-card)] p-3 ${bubble(m.sender.isSelf, m.sender.kind === 'SYSTEM')}`}>
              <p className="mb-1 text-xs font-semibold text-steel">
                {m.sender.kind === 'SYSTEM' ? t('system') : m.sender.isSelf ? t('you') : m.sender.displayName}{sep}<DateTime iso={m.createdAt} />
              </p>
              {m.body ? <p className="whitespace-pre-wrap break-words">{m.sender.kind === 'SYSTEM' ? systemTextFor(m.body, locale === 'en' ? 'en' : 'fa') : m.body}</p> : null}
              {m.quoteCard ? (
                <Link href={staff ? `/admin/quotes/${m.quoteCard.quoteVersionId}` : `${quoteLinkBase}/${m.quoteCard.quoteVersionId}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-action bg-white px-3 font-semibold text-action hover:bg-action-soft">
                  <FileText aria-hidden className="size-4" />
                  {tq('cardInChat', { n: m.quoteCard.versionNumber })} — {tq('openCard')}
                </Link>
              ) : null}
              {m.attachments.length ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {m.attachments.map((a) => (
                    <li key={a.id} className="text-sm">
                      {a.downloadUrl ? (
                        <a href={a.downloadUrl} className="inline-flex min-h-9 items-center gap-1 text-action underline"><FileText aria-hidden className="size-4" /><bdi>{a.filename}</bdi></a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-steel"><FileText aria-hidden className="size-4" /><bdi>{a.filename}</bdi></span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              {m.sender.isSelf ? (
                <p className="mt-1 flex items-center justify-end gap-1 text-xs text-steel">
                  {m.readByOther ? <CheckCheck aria-hidden className="size-3.5" /> : <Check aria-hidden className="size-3.5" />}
                  {m.readByOther ? t('read') : t('sent')}
                </p>
              ) : null}
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.clientMessageId} className={`max-w-[85%] rounded-[var(--radius-card)] p-3 ${bubble(true, false)} opacity-80`}>
              <p className="whitespace-pre-wrap break-words">{p.body}</p>
              <p className={`mt-1 flex items-center justify-end gap-1 text-xs ${p.state === 'failed' ? 'text-danger' : 'text-steel'}`}>
                {p.state === 'failed' ? <AlertCircle aria-hidden className="size-3.5" /> : <Clock aria-hidden className="size-3.5" />}
                {p.state === 'failed' ? t('failed') : t('sending')}
                {p.state === 'failed' ? (
                  <button type="button" className="ms-2 min-h-9 cursor-pointer font-semibold underline" onClick={() => void deliver(p)}>{t('retry')}</button>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      </div>
      <form className="flex flex-col gap-3 border-t border-line-soft p-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor={`composer-${conversationId}`} className="sr-only">{t('placeholder')}</label>
        <textarea
          id={`composer-${conversationId}`}
          rows={2}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
          }}
          placeholder={t('placeholder')}
          className="w-full rounded-[var(--radius-control)] border border-line-strong px-3 py-2.5 leading-7 placeholder:text-steel/80 hover:border-ink focus-visible:border-action"
        />
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-action underline-offset-4 hover:underline">{t('attach')}</summary>
          <div className="mt-2"><FileUploader key={uploaderKey} purpose="MESSAGE" onChange={onFiles} id={`chat-files-${conversationId}`} /></div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-steel">{staff ? '' : t('priceInTextNote')}</p>
          <Button type="submit" disabled={filesBusy || (!body.trim() && !files.length)} icon={<Send aria-hidden className={`size-4 ${locale === 'fa' ? 'rotate-180' : ''}`} />}>
            {t('send')}
          </Button>
        </div>
        {connection === 'offline' && !staff ? <Alert tone="info" title={t('staffOffline')} /> : null}
      </form>
    </section>
  );
}
