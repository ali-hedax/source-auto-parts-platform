'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { useL } from './shell';

/** Confirmation for an erasure that cannot be undone: a warning plus a current authenticator code. */
export function EraseConfirm({ id, title, onConfirm, onCancel }: { id: string; title: string; onConfirm: (code: string) => Promise<void>; onCancel: () => void }) {
  const t = useTranslations();
  const l = useL();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^[0-9۰-۹]{6}$/.test(code.trim());
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(code.trim()); } finally { setBusy(false); }
  };
  return (
    <Alert tone="danger" title={title} className="mt-2">
      <p className="text-sm leading-6">{l('نام، ایمیل، رمز، دسترسی‌ها و دعوت‌های این شخص پاک می‌شود و در «گزارش رویدادها» به‌جای نام و ایمیل «حذف‌شده» می‌آید. کارهای ثبت‌شده (سفارش‌ها، پیام‌ها) بدون نام می‌مانند. این کار برگشت‌پذیر نیست.', 'Their name, e-mail, password, access and invitations are removed, and the audit log shows "deleted" instead of their name and e-mail. Recorded work (orders, messages) stays without a name. This cannot be undone.')}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field id={`erase-${id}`} label={t('admin.ownerConfirmCode')} className="max-w-[12rem]">
          <Input id={`erase-${id}`} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Button size="sm" variant="danger" loading={busy} disabled={!valid} onClick={() => void confirm()}>{l('حذف کامل برای همیشه', 'Erase permanently')}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>{l('انصراف', 'Cancel')}</Button>
      </div>
    </Alert>
  );
}
