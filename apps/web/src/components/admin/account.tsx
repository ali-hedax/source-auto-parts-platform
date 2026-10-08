'use client';

import type { MeView } from '@hedax/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert, Ltr, PageHeader, Section } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

/** Six digits, Persian or Latin (the API converts Persian digits). */
const CODE = /^[0-9۰-۹]{6}$/;

/** The signed-in staff member's own name, e-mail and password ("my account"). */
export function AccountPage() {
  const t = useTranslations();
  const l = useL();
  const me = useApi<MeView>('/me');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('admin.myAccount')}
        description={l('تغییر ایمیل یا گذرواژه همهٔ نشست‌ها را می‌بندد و باید دوباره وارد شوید. تأیید دومرحله‌ای، کدهای بازیابی و نقش‌ها تغییر نمی‌کنند.', 'Changing the e-mail or password ends every session and you sign in again. Two-step verification, recovery codes and roles stay as they are.')}
      />
      <Async state={me}>
        {(user) => (
          <>
            <NameForm initial={user.displayName ?? ''} onSaved={() => void me.reload()} />
            <EmailForm current={user.email ?? ''} mfa={user.mfaEnabled} />
            <PasswordForm mfa={user.mfaEnabled} />
          </>
        )}
      </Async>
    </div>
  );
}

function useSubmit() {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try { await action(); } catch (e) { setError(errorText(t, e)); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function useSignInAgain() {
  const locale = useLocale();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload: every session was ended by the API
  return () => window.location.assign(`/${locale}/staff/login`);
}

function NameForm({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const t = useTranslations();
  const l = useL();
  const [fullName, setFullName] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useSubmit();
  const save = () => run(async () => {
    setSaved(false);
    await api('/me/name', { method: 'PATCH', body: { fullName } });
    setSaved(true);
    onSaved();
  });
  return (
    <Section title={l('نام', 'Name')}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex max-w-md flex-col gap-3">
        {error ? <Alert tone="danger" title={error} /> : null}
        {saved ? <Alert tone="success" title={l('نام ذخیره شد.', 'Name saved.')} /> : null}
        <Field id="acc-name" label={t('auth.fullName')} required>
          <Input id="acc-name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Button type="submit" loading={busy} disabled={fullName.trim().length < 2} className="self-start">{t('common.save')}</Button>
      </form>
    </Section>
  );
}

function CodeField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const t = useTranslations();
  const l = useL();
  return (
    <Field id={id} label={t('admin.ownerConfirmCode')} hint={l('کد ۶ رقمی برنامهٔ احراز هویت؛ رقم فارسی یا انگلیسی.', 'The 6-digit code from your authenticator app.')} required>
      <Input id={id} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function EmailForm({ current, mfa }: { current: string; mfa: boolean }) {
  const t = useTranslations();
  const l = useL();
  const signInAgain = useSignInAgain();
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, run } = useSubmit();
  const ready = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && email.trim().toLowerCase() !== current && currentPassword && (!mfa || CODE.test(code.trim()));
  const save = () => run(async () => {
    const res = await api<{ signedOut: boolean }>('/me/email', { method: 'POST', body: { email: email.trim(), currentPassword, ...(mfa ? { code: code.trim() } : {}) } });
    if (res.signedOut) signInAgain();
  });
  return (
    <Section title={t('auth.email')}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex max-w-md flex-col gap-3">
        <p className="text-sm text-steel">{l('ایمیل فعلی', 'Current e-mail')}: <Ltr>{current || '—'}</Ltr></p>
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field id="acc-email" label={l('ایمیل تازه', 'New e-mail')} required>
          <Input id="acc-email" type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="acc-email-pw" label={l('گذرواژهٔ فعلی', 'Current password')} required>
          <Input id="acc-email-pw" type="password" dir="ltr" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </Field>
        {mfa ? <CodeField id="acc-email-code" value={code} onChange={setCode} /> : null}
        <Button type="submit" loading={busy} disabled={!ready} className="self-start">{l('تغییر ایمیل', 'Change e-mail')}</Button>
      </form>
    </Section>
  );
}

function PasswordForm({ mfa }: { mfa: boolean }) {
  const t = useTranslations();
  const l = useL();
  const signInAgain = useSignInAgain();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, run } = useSubmit();
  const mismatch = repeat.length > 0 && repeat !== newPassword;
  const ready = currentPassword && newPassword.length >= 12 && repeat === newPassword && (!mfa || CODE.test(code.trim()));
  const save = () => run(async () => {
    await api('/me/password', { method: 'POST', body: { currentPassword, newPassword, ...(mfa ? { code: code.trim() } : {}) } });
    signInAgain();
  });
  return (
    <Section title={t('auth.password')}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex max-w-md flex-col gap-3">
        {error ? <Alert tone="danger" title={error} /> : null}
        <Field id="acc-pw-current" label={l('گذرواژهٔ فعلی', 'Current password')} required>
          <Input id="acc-pw-current" type="password" dir="ltr" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </Field>
        <Field id="acc-pw-new" label={l('گذرواژهٔ تازه', 'New password')} hint={l('دست‌کم ۱۲ نویسه؛ شبیه ایمیل یا نام نباشد.', 'At least 12 characters; not similar to your e-mail or name.')} required>
          <Input id="acc-pw-new" type="password" dir="ltr" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <Field id="acc-pw-repeat" label={l('تکرار گذرواژهٔ تازه', 'Repeat the new password')} {...(mismatch ? { error: l('با گذرواژهٔ تازه یکی نیست.', 'Does not match the new password.') } : {})} required>
          <Input id="acc-pw-repeat" type="password" dir="ltr" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
        {mfa ? <CodeField id="acc-pw-code" value={code} onChange={setCode} /> : null}
        <Button type="submit" loading={busy} disabled={!ready} className="self-start">{l('تغییر گذرواژه', 'Change password')}</Button>
      </form>
    </Section>
  );
}
