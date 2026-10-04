'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field, Input } from '@/components/ui/field';
import { Alert, Ltr } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

type Step = { kind: 'password' } | { kind: 'mfa'; challengeId: string } | { kind: 'enroll'; challengeId: string; secret: string; uri: string } | { kind: 'codes'; codes: string[] };

/** Staff sign-in: password → TOTP (or recovery code); first sign-in of MFA-required roles enrolls TOTP. */
export function StaffLogin() {
  const t = useTranslations();
  const locale = useLocale();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload so server components and the header pick up the new session
  const done = () => window.location.assign(`/${locale}/admin`);
  const fail = (e: unknown) => setError(errorText(t, e));

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (step.kind === 'password') {
        const res = await api<{ status: string; challengeId?: string }>('/auth/staff/login', { method: 'POST', body: { email, password } });
        if (res.status === 'MFA_REQUIRED' && res.challengeId) setStep({ kind: 'mfa', challengeId: res.challengeId });
        else if (res.status === 'MFA_ENROLLMENT_REQUIRED') {
          const enroll = await api<{ challengeId: string; secret: string; otpauthUri: string }>('/auth/staff/mfa/enroll', { method: 'POST' });
          setStep({ kind: 'enroll', challengeId: enroll.challengeId, secret: enroll.secret, uri: enroll.otpauthUri });
        } else done();
      } else if (step.kind === 'mfa') {
        await api('/auth/staff/mfa', { method: 'POST', body: { challengeId: step.challengeId, code: code.trim().toUpperCase() } });
        done();
      } else if (step.kind === 'enroll') {
        const res = await api<{ recoveryCodes: string[] }>('/auth/staff/mfa/enroll/confirm', { method: 'POST', body: { challengeId: step.challengeId, code: code.trim() } });
        setStep({ kind: 'codes', codes: res.recoveryCodes });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setCode('');
    }
  };

  if (step.kind === 'codes') {
    return (
      <div className="card flex flex-col gap-4 p-6">
        <Alert tone="warning" title={t('auth.recoveryCodes')}>
          <ul className="mt-2 grid grid-cols-2 gap-2 font-mono">{step.codes.map((c) => <li key={c}><Ltr>{c}</Ltr></li>)}</ul>
        </Alert>
        <Button onClick={done}>{t('common.next')}</Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="card flex flex-col gap-4 p-6">
      <ErrorSummary title={t('validation.summaryTitle')} errors={[]} generalError={error} />
      {step.kind === 'password' ? (
        <>
          <Field id="staff-email" label={t('auth.email')} required>
            <Input id="staff-email" type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="staff-password" label={t('auth.password')} required>
            <Input id="staff-password" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold">{step.kind === 'mfa' ? t('auth.mfaTitle') : t('auth.mfaEnrollTitle')}</h2>
          <p className="text-steel">{step.kind === 'mfa' ? t('auth.mfaHint') : t('auth.mfaEnrollHint')}</p>
          {step.kind === 'enroll' ? (
            <div className="rounded-[var(--radius-control)] bg-surface p-3">
              <p className="text-sm text-steel">{t('auth.mfaSecret')}</p>
              <p className="break-all font-mono text-lg font-bold"><Ltr>{step.secret}</Ltr></p>
            </div>
          ) : null}
          <Field id="staff-code" label={t('auth.code')} required>
            <Input id="staff-code" dir="ltr" autoComplete="one-time-code" maxLength={9} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </>
      )}
      <Button type="submit" size="lg" loading={busy}>{t('auth.signIn')}</Button>
    </form>
  );
}
