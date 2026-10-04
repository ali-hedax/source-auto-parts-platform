'use client';

import type { ConversationSummary, OrderView, QuoteVersionView, SourcingRequestView } from '@hedax/contracts';
import { systemTextFor } from '@hedax/contracts/constants';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Async } from '@/components/ui/async';
import { DateTime, Money, Num } from '@/components/ui/format';
import { EmptyState, Ltr, PageHeader, Section, StatusBadge, TableScroll, td, th } from '@/components/ui/misc';
import { ChatThread } from '@/components/chat/chat-thread';
import { OrderDetail } from '@/components/orders/order-detail';
import { QuoteView } from '@/components/quotes/quote-view';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/use-api';

export function OrderDetailPage({ kind }: { kind: 'orders' | 'procurements' }) {
  const { id } = useParams<{ id: string }>();
  const state = useApi<OrderView>(`/${kind}/${id}`);
  return <Async state={state}>{(o) => <OrderDetail order={o} />}</Async>;
}

export function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useApi<QuoteVersionView>(`/quotes/${id}`);
  return <Async state={state}>{(q) => <QuoteView quote={q} onChange={() => void state.reload()} />}</Async>;
}

export function RequestDetailPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const state = useApi<SourcingRequestView>(`/sourcing-requests/${id}`);
  return (
    <Async state={state}>
      {(r) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={r.title} description={<Ltr>{r.reference}</Ltr>} actions={<StatusBadge status={r.status} label={t(`status.${r.status}` as never)} />} />
          {r.items.length ? (
            <TableScroll caption={t('request.items')}>
              <thead>
                <tr>
                  <th className={th}>{t('request.partName')}</th>
                  <th className={th}>{t('request.quantity')}</th>
                  <th className={th}>{t('request.vehicleBrand')}</th>
                  <th className={th}>{t('request.vehicleModel')}</th>
                  <th className={th}>{t('request.preference')}</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <td className={td}>{i.partName}{i.notes ? <span className="block text-xs text-steel">{i.notes}</span> : null}</td>
                    <td className={td}>{i.quantity}</td>
                    <td className={td}>{i.vehicleBrand ?? '—'}</td>
                    <td className={td}>{[i.vehicleModel, i.vehicleYear].filter(Boolean).join(' ') || '—'}</td>
                    <td className={td}>{t(`request.pref_${i.preference}` as never)}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          ) : null}
          {r.quotes.length ? (
            <Section title={t('account.quotes')} id="req-quotes">
              <ul className="flex flex-col gap-2">
                {r.quotes.map((q) => (
                  <li key={q.versionId} className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface p-3">
                    <Link href={`/account/quotes/${q.versionId}`} className="font-semibold text-action underline"><Ltr>{q.reference}</Ltr> — {t('quote.version', { n: q.versionNumber })}</Link>
                    <StatusBadge status={q.status} label={t(`status.${q.status}` as never)} />
                    <Money value={q.totalPayable} />
                    <span className="text-sm text-steel">{t('quote.validUntil')}: <DateTime iso={q.validUntil} /></span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <ChatThread conversationId={r.conversationId} />
        </div>
      )}
    </Async>
  );
}

export function MessagesList({ basePath = '/account/messages' }: { basePath?: string }) {
  const t = useTranslations();
  const locale = useLocale() as 'fa' | 'en';
  const state = useApi<ConversationSummary[]>('/conversations');
  return (
    <>
      <PageHeader title={t('account.messages')} />
      <Async state={state}>
        {(rows) =>
          rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link href={`${basePath}/${c.id}`} className="card flex flex-col gap-1 p-4 hover:border-tech">
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {c.subject}
                      {c.unreadCount ? <span className="rounded-full bg-action px-2 text-xs text-white"><Num value={c.unreadCount} /></span> : null}
                    </span>
                    {c.lastMessagePreview ? <span className="truncate text-sm text-steel">{c.lastMessageFromSystem ? systemTextFor(c.lastMessagePreview, locale) : c.lastMessagePreview}</span> : null}
                    {c.lastMessageAt ? <span className="text-xs text-steel"><DateTime iso={c.lastMessageAt} /></span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t('chat.empty')} />
          )
        }
      </Async>
    </>
  );
}

export function ConversationPage({ staff = false }: { staff?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const state = useApi<{ id: string; subject: string }>(`/conversations/${id}`);
  return (
    <Async state={state}>
      {(c) => (
        <div className="flex flex-col gap-4">
          <PageHeader title={c.subject} />
          <ChatThread conversationId={c.id} staff={staff} />
        </div>
      )}
    </Async>
  );
}
