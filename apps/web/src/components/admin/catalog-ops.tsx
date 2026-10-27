'use client';

import { formatQuantity, isValidQuantity } from '@hedax/domain';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { DateTime, Quantity } from '@/components/ui/format';
import { Badge, Code, EmptyState, Ltr, PageHeader, TableScroll, td, th } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { typedNumber } from '@/lib/numbers';
import { useApi } from '@/lib/use-api';
import { useCodeLabel, useL } from './shell';

interface InvRow { productId: string; sku: string; nameFa: string; unit: { name: string; allowDecimal: boolean; step: number }; onHand: number; reserved: number; available: number; lowStockThreshold: number; isLow: boolean; version: number; updatedAt: string }

export function InventoryPage() {
  const t = useTranslations();
  const l = useL();
  const search = useSearchParams();
  const [low, setLow] = useState(search.get('lowStock') === '1');
  const state = useApi<{ items: InvRow[]; total: number }>(`/admin/inventory?pageSize=100${low ? '&lowStock=1' : ''}`);
  const [target, setTarget] = useState<InvRow | null>(null);
  const [ledgerFor, setLedgerFor] = useState<InvRow | null>(null);
  return (
    <>
      <PageHeader title={t('admin.inventory')} description={l('موجودی قابل فروش = موجودی فیزیکی − رزروشده. شمارش جدید نمی‌تواند کمتر از رزروشده باشد.', 'Available = on hand − reserved. A new count can never be lower than reserved.')} />
      <Checkbox id="inv-low" label={t('admin.lowStock')} checked={low} onChange={(e) => setLow(e.target.checked)} className="mb-3" />
      <Async state={state}>
        {(data) => data.items.length ? (
          <TableScroll caption={t('admin.inventory')}>
            <thead><tr><th className={th}>{t('admin.sku')}</th><th className={th}>{t('admin.name')}</th><th className={th}>{t('admin.onHand')}</th><th className={th}>{t('admin.reserved')}</th><th className={th}>{t('admin.available')}</th><th className={th} /></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.productId}>
                  <td className={td}><Code>{r.sku}</Code></td>
                  <td className={td}>{r.nameFa}</td>
                  <td className={td}><Quantity value={r.onHand} unit={r.unit} /></td>
                  <td className={td}><Quantity value={r.reserved} unit={r.unit} /></td>
                  <td className={td}>{r.isLow ? <Badge tone="warning"><Quantity value={r.available} unit={r.unit} /></Badge> : <Quantity value={r.available} unit={r.unit} />}</td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setTarget(r)}>{t('admin.adjustStock')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setLedgerFor(r)}>{t('admin.ledger')}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('parts.empty')} />}
      </Async>
      {target ? <AdjustDialog row={target} onClose={() => { setTarget(null); void state.reload(); }} /> : null}
      {ledgerFor ? <LedgerDialog row={ledgerFor} onClose={() => setLedgerFor(null)} /> : null}
    </>
  );
}

function AdjustDialog({ row, onClose }: { row: InvRow; onClose: () => void }) {
  const t = useTranslations();
  const l = useL();
  const locale = useLocale() as 'fa' | 'en';
  const reserved = `${formatQuantity(row.reserved, locale)} ${row.unit.name}`;
  const rule = { name: row.unit.name, allowDecimal: row.unit.allowDecimal, stepMilli: Math.round(row.unit.step * 1000) };
  const [count, setCount] = useState(String(row.onHand));
  const [reason, setReason] = useState('PHYSICAL_COUNT');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const n = typedNumber(count);
    // In the product's unit: decimals only where the unit allows them, a multiple of its step.
    if (!Number.isFinite(n) || n < 0 || (n > 0 && !isValidQuantity(n, rule))) { setError(t('parts.quantityInvalid', { step: formatQuantity(row.unit.step, locale), unit: row.unit.name })); return; }
    if (n < row.reserved) { setError(l(`شمارش نمی‌تواند کمتر از رزروشده (${reserved}) باشد.`, `Count cannot be below reserved (${reserved}).`)); return; }
    setBusy(true);
    try {
      await api('/admin/inventory/adjust', { method: 'POST', body: { productId: row.productId, newOnHand: n, reason, note: note || undefined, expectedVersion: row.version } });
      onClose();
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${t('admin.adjustStock')} — ${row.sku}`} closeLabel={t('common.close')}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-4">
        <Field id="adj-count" label={`${t('admin.newOnHand')} (${row.unit.name})`} error={error ?? undefined} hint={`${t('admin.reserved')}: ${reserved}`} required>
          <Input id="adj-count" inputMode={row.unit.allowDecimal ? 'decimal' : 'numeric'} value={count} onChange={(e) => setCount(e.target.value)} invalid={!!error} />
        </Field>
        <Field id="adj-reason" label={t('admin.adjustReason')}>
          <Select id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="PHYSICAL_COUNT">{l('شمارش فیزیکی', 'Physical count')}</option>
            <option value="RECEIVED">{l('ورود کالا', 'Goods received')}</option>
            <option value="DAMAGED">{l('آسیب‌دیده', 'Damaged')}</option>
            <option value="LOST">{l('مفقود', 'Lost')}</option>
            <option value="CORRECTION">{l('اصلاح', 'Correction')}</option>
          </Select>
        </Field>
        <Field id="adj-note" label={l('یادداشت', 'Note')} optionalLabel={t('common.optional')}><Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button type="submit" loading={busy}>{t('common.save')}</Button>
      </form>
    </Dialog>
  );
}

function LedgerDialog({ row, onClose }: { row: InvRow; onClose: () => void }) {
  const t = useTranslations();
  const label = useCodeLabel();
  const state = useApi<Array<{ id: string; type: string; onHandDelta: number; reservedDelta: number; onHandAfter: number; reservedAfter: number; reason: string; createdAt: string }>>(`/admin/inventory/${row.productId}/movements`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`${t('admin.ledger')} — ${row.sku}`} closeLabel={t('common.close')}>
      <Async state={state}>
        {(rows) => (
          <ul className="flex flex-col gap-2 text-sm">
            {rows.map((m) => (
              <li key={m.id} className="rounded-[var(--radius-control)] border border-line-soft bg-surface p-2">
                <span className="font-semibold">{label('movement', m.type)}</span> · {label('movementReason', m.reason)}
                <span className="block text-xs"><Ltr>Δ {m.onHandDelta} / {m.reservedDelta} → {m.onHandAfter} / {m.reservedAfter}</Ltr></span>
                <span className="block text-xs text-steel"><DateTime iso={m.createdAt} /></span>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </Dialog>
  );
}

export { TaxonomyPage } from './taxonomy-page';
