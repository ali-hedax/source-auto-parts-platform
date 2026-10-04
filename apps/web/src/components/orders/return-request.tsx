'use client';

import type { OrderLineView } from '@hedax/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { FileUploader } from '@/components/files/file-uploader';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';

/**
 * Cancel/return *request*: staff decide later; nothing is refunded or restocked here.
 * A return names the delivered items and quantities; a cancellation covers the whole order.
 */
export function ReturnRequestButton({ orderId, kind, lines = [] }: { orderId: string; kind: 'CANCEL' | 'RETURN'; lines?: OrderLineView[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const returnable = lines.filter((l) => l.returnableQuantity > 0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const onFiles = useCallback((ids: string[]) => setFiles(ids), []);
  const items = returnable.map((l) => ({ orderItemId: l.id, quantity: quantities[l.id] ?? 0 })).filter((i) => i.quantity > 0);
  const submit = async () => {
    const reasonError = reason.trim().length < 5 ? `${t('order.reason')}: ${t('validation.tooShort')}` : null;
    const missingItems = kind === 'RETURN' && items.length === 0 ? t('order.returnItemsRequired') : null;
    setError(reasonError);
    setItemsError(missingItems);
    if (reasonError || missingItems) return;
    setState('saving');
    try {
      await api('/returns', { method: 'POST', body: { orderId, kind, reason: reason.trim(), items: kind === 'RETURN' ? items : [], attachmentIds: files } });
      setState('done');
    } catch (e) {
      setState('error');
      setError(errorText(t, e));
    }
  };
  const label = kind === 'CANCEL' ? t('order.requestCancel') : t('order.requestReturn');
  return (
    <Dialog open={open} onOpenChange={setOpen} title={label} closeLabel={t('common.close')} trigger={<Button variant="secondary">{label}</Button>}>
      {state === 'done' ? (
        <Alert tone="success" title={t('status.REQUESTED')} />
      ) : (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-4">
          {kind === 'RETURN' ? (
            <fieldset className="flex flex-col gap-3" aria-describedby={itemsError ? `ret-items-error-${orderId}` : undefined}>
              <legend className="mb-1 font-semibold">{t('order.returnItems')}</legend>
              {returnable.map((l) => (
                <Field key={l.id} id={`ret-qty-${l.id}`} label={`${locale === 'en' ? (l.name.en ?? l.name.fa) : l.name.fa} — ${t('order.returnableUpTo', { count: l.returnableQuantity })}`}>
                  <Input
                    id={`ret-qty-${l.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={l.returnableQuantity}
                    value={quantities[l.id] ?? 0}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(l.returnableQuantity, Math.trunc(Number(e.target.value) || 0)));
                      setQuantities((q) => ({ ...q, [l.id]: n }));
                    }}
                    className="w-28"
                  />
                </Field>
              ))}
              {itemsError ? <p id={`ret-items-error-${orderId}`} role="alert" className="text-sm font-semibold text-danger">{itemsError}</p> : null}
            </fieldset>
          ) : null}
          <Field id={`ret-reason-${kind}`} label={t('order.reason')} error={error ?? undefined} required>
            <Textarea id={`ret-reason-${kind}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} invalid={!!error} />
          </Field>
          <FileUploader purpose="RETURN_REQUEST" onChange={onFiles} id={`ret-files-${kind}`} />
          <Button type="submit" loading={state === 'saving'}>{t('common.submit')}</Button>
        </form>
      )}
    </Dialog>
  );
}
