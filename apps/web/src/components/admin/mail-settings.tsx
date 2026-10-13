'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { DateTime } from '@/components/ui/format';
import { Alert, Badge, DefinitionList, Ltr, Section } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

interface MailStatus {
  provider: 'smtp' | 'dev-log' | 'memory' | 'none';
  configured: boolean;
  from: string | null;
  lastTest: { id: string; status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED'; createdAt: string; sentAt: string | null; lastError: string | null; smtpResponse: string | null } | null;
}

/** Outgoing e-mail status and a test message that can only go to the company address. */
export function MailSettings() {
  const t = useTranslations();
  const l = useL();
  const state = useApi<MailStatus>('/admin/mail/status');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sendTest = async () => {
    setError(null);
    setBusy(true);
    try { await api('/admin/mail/test', { method: 'POST', body: {} }); await state.reload(); } catch (e) { setError(errorText(t, e)); } finally { setBusy(false); }
  };
  return (
    <Section title={l('ایمیل سایت', 'Site e-mail')} id="st-mail">
      <Async state={state}>
        {(s) => {
          const test = s.lastTest;
          const testLabel = !test ? '—' : test.status === 'SENT'
            ? l('سرور ایمیل پذیرفت؛ رسیدن را در صندوق بررسی کنید', 'Accepted by the mail server; check the inbox')
            : test.status === 'FAILED' ? l('ناموفق', 'Failed') : l('در صف ارسال', 'Queued');
          return (
            <>
              <DefinitionList items={[
                { term: l('وضعیت', 'Status'), value: s.configured ? <Badge tone="success">{l('متصل (SMTP با TLS)', 'Connected (SMTP over TLS)')}</Badge> : <Badge tone="warning">{l('تنظیم نشده؛ دعوت‌ها فقط لینک دارند', 'Not configured; invitations are link-only')}</Badge> },
                ...(s.from ? [{ term: l('فرستنده', 'Sender'), value: <Ltr>{s.from}</Ltr> }] : []),
                { term: l('آخرین ایمیل آزمایشی', 'Last test e-mail'), value: <>{testLabel}{test ? <span className="block text-xs text-steel"><DateTime iso={test.sentAt ?? test.createdAt} />{test.lastError ? <> · <Ltr>{test.lastError}</Ltr></> : null}</span> : null}</> },
              ]} />
              {error ? <Alert tone="danger" className="mt-3" title={error} /> : null}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="secondary" loading={busy} disabled={!s.configured || !s.from} onClick={() => void sendTest()}>{l('ارسال ایمیل آزمایشی', 'Send a test e-mail')}</Button>
                {s.from ? <span className="text-sm text-steel">{l('فقط به نشانی فرستنده:', 'Only to the sender address:')} <Ltr>{s.from}</Ltr></span> : null}
                <Button variant="ghost" onClick={() => void state.reload()}>{l('به‌روزرسانی وضعیت', 'Refresh status')}</Button>
              </div>
            </>
          );
        }}
      </Async>
    </Section>
  );
}
