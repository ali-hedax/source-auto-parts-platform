'use client';

import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

export function AcceptInvitation() {
  const t = useTranslations();
  const locale = useLocale();
  const token = useSearchParams().get('token') ?? '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/invitations/accept', { method: 'POST', body: { token, fullName: name, password } });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so server components and the header pick up the new session
      window.location.assign(`/${locale}/staff/login`);
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-5 rounded-[var(--radius-panel)] border border-line-soft border-t-4 border-t-carbon bg-white p-6 sm:p-8">
      <ErrorSummary title={t('validation.summaryTitle')} errors={[]} generalError={error} />
      <Field id="inv-name" label={t('auth.fullName')} required>
        <Input id="inv-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="inv-password" label={t('auth.password')} hint={t('auth.passwordRule')} required>
        <Input id="inv-password" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="inv-password-hint" />
      </Field>
      <Button type="submit" size="lg" loading={busy} disabled={!token}>{t('auth.accept')}</Button>
    </form>
  );
}
