'use client';

import { normalizeIranMobile } from '@hedax/domain';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field, Input } from '@/components/ui/field';
import { Alert, Ltr } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

/** Only same-site relative paths are accepted as a post-login destination. */
function safeNext(value: string | null, locale: string): string {
  if (value && /^\/(fa|en)\/[A-Za-z0-9/_\-?=&%.]*$/.test(value) && !value.startsWith('//')) return value;
  return `/${locale}/account`;
}

export function OtpLogin() {
  const t = useTranslations();
  const locale = useLocale();
  const search = useSearchParams();
  const [step, setStep] = useState<'mobile' | 'code'>('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const message = (e: unknown) => (errorText(t, e));

  const request = async () => {
    setError(null);
    const parsed = normalizeIranMobile(mobile);
    if (!parsed.ok) {
      setFieldError(t('validation.invalidMobile'));
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      const res = await api<{ resendAfterSeconds: number; devCode?: string }>('/auth/otp/request', { method: 'POST', body: { mobile: parsed.national } });
      setDevCode(res.devCode ?? null);
      setCooldown(res.resendAfterSeconds);
      setStep('code');
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (!/^[0-9۰-۹]{6}$/.test(code.trim())) {
      setFieldError(t('validation.invalidCode'));
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      await api('/auth/otp/verify', { method: 'POST', body: { mobile: normalizeIranMobile(mobile).ok ? mobile : mobile, code: code.trim() } });
      window.location.assign(safeNext(search.get('next'), locale));
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  const fieldId = step === 'mobile' ? 'login-mobile' : 'login-code';
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void (step === 'mobile' ? request() : verify()); }} className="card flex flex-col gap-4 p-6">
      <ErrorSummary title={t('validation.summaryTitle')} errors={fieldError ? [{ fieldId, message: fieldError }] : []} generalError={error} />
      {step === 'mobile' ? (
        <Field id="login-mobile" label={t('auth.mobile')} hint={t('auth.mobileHint')} error={fieldError ?? undefined} required>
          <Input id="login-mobile" dir="ltr" inputMode="tel" autoComplete="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} invalid={!!fieldError} aria-describedby="login-mobile-hint" />
        </Field>
      ) : (
        <>
          <Field id="login-code" label={t('auth.code')} hint={t('auth.codeHint', { mobile })} error={fieldError ?? undefined} required>
            <Input ref={codeRef} id="login-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} invalid={!!fieldError} aria-describedby="login-code-hint" />
          </Field>
          {devCode ? <Alert tone="warning" title={t('auth.devCode', { code: '' })}><Ltr className="text-lg font-bold">{devCode}</Ltr></Alert> : null}
        </>
      )}
      <Button type="submit" size="lg" loading={busy}>
        {step === 'mobile' ? (busy ? t('auth.sending') : t('auth.sendCode')) : busy ? t('auth.verifying') : t('auth.verify')}
      </Button>
      {step === 'code' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" className="min-h-11 cursor-pointer text-action underline disabled:text-steel disabled:no-underline" disabled={cooldown > 0 || busy} onClick={() => void request()}>
            {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
          </button>
          <button type="button" className="min-h-11 cursor-pointer text-action underline" onClick={() => { setStep('mobile'); setCode(''); setDevCode(null); }}>
            {t('auth.changeMobile')}
          </button>
        </div>
      ) : null}
    </form>
  );
}
