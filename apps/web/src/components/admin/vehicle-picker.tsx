'use client';

import type { VehicleOption } from '@hedax/contracts';
import { normalizeSearchText, vehicleKey } from '@hedax/domain';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/errors';
import { useL } from './shell';
import { similarSuggestion } from './vehicles-page';

export interface FitmentValue { vehicleId: string; modelId: string | null }

/**
 * «کاربرد در خودرو» on the product form: search, tick a whole vehicle («پژو») or specific models
 * («پژو ۲۰۶»), and add a missing vehicle or model on the spot. A very similar existing name is
 * offered instead of creating a duplicate.
 */
export function VehiclePicker({ id, value, onChange, options, onOptionsChanged }: {
  id: string; value: FitmentValue[]; onChange: (v: FitmentValue[]) => void; options: VehicleOption[]; onOptionsChanged: () => Promise<void>;
}) {
  const t = useTranslations();
  const l = useL();
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelDraft, setModelDraft] = useState<Record<string, string>>({});
  const has = (vehicleId: string, modelId: string | null) => value.some((v) => v.vehicleId === vehicleId && v.modelId === modelId);
  const toggle = (vehicleId: string, modelId: string | null, on: boolean) => {
    const rest = value.filter((v) => !(v.vehicleId === vehicleId && v.modelId === modelId));
    // The whole vehicle covers its models: ticking it drops the model ticks of that vehicle.
    const next = on ? [...(modelId === null ? rest.filter((v) => v.vehicleId !== vehicleId) : rest), { vehicleId, modelId }] : rest;
    onChange(next);
  };
  const label = (v: FitmentValue) => {
    const vehicle = options.find((o) => o.id === v.vehicleId);
    const model = v.modelId ? vehicle?.models.find((m) => m.id === v.modelId) : null;
    return vehicle ? (model ? `${vehicle.name} ${model.name}` : `${vehicle.name} (${l('همهٔ مدل‌ها', 'all models')})`) : '…';
  };
  const query = normalizeSearchText(q);
  const shown = useMemo(() => options.filter((o) => {
    if (!o.active && !value.some((v) => v.vehicleId === o.id)) return false;
    if (!query) return true;
    return [o.name, o.nameEn ?? '', ...o.models.map((m) => `${o.name} ${m.name}`)].some((s) => normalizeSearchText(s).includes(query) || vehicleKey(s).includes(vehicleKey(q)));
  }), [options, query, q, value]);
  const exact = q.trim() && options.some((o) => vehicleKey(o.name) === vehicleKey(q));

  const quickAdd = async (confirmNew = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string; created: boolean }>('/admin/vehicles/quick', { method: 'POST', body: { name: q.trim(), confirmNew } });
      await onOptionsChanged();
      toggle(res.id, null, true);
      setSimilar(null);
      setQ('');
    } catch (e) {
      const s = similarSuggestion(e);
      if (s) setSimilar(s);
      else setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const addModel = async (vehicleId: string) => {
    const name = (modelDraft[vehicleId] ?? '').trim();
    if (!name) return;
    setError(null);
    try {
      const res = await api<{ id: string }>(`/admin/vehicles/${vehicleId}/models/quick`, { method: 'POST', body: { name } });
      await onOptionsChanged();
      onChange([...value.filter((v) => !(v.vehicleId === vehicleId && v.modelId === null)), { vehicleId, modelId: res.id }]);
      setModelDraft({ ...modelDraft, [vehicleId]: '' });
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={`${id}-hint`}>
      <legend className="mb-1 text-sm font-semibold">{l('کاربرد در خودرو', 'Vehicle fitment')}</legend>
      <p id={`${id}-hint`} className="text-xs text-steel">{l('کل خودرو (همهٔ مدل‌ها) یا مدل‌های خاص را انتخاب کنید. اگر خودرو در فهرست نیست، همین‌جا اضافه‌اش کنید.', 'Pick a whole vehicle (all models) or specific models. Add a missing vehicle right here.')}</p>
      {value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={l('خودروهای انتخاب‌شده', 'Selected vehicles')}>
          {value.map((v) => (
            <li key={`${v.vehicleId}:${v.modelId ?? ''}`} className="inline-flex items-center gap-1 rounded-full border border-action/40 bg-info-soft px-3 py-1 text-sm">
              {label(v)}
              <button type="button" className="grid size-6 place-items-center rounded-full hover:bg-white" onClick={() => toggle(v.vehicleId, v.modelId, false)} aria-label={l(`حذف ${label(v)}`, `Remove ${label(v)}`)}><X aria-hidden className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-steel">{l('هنوز خودرویی انتخاب نشده است.', 'No vehicle selected yet.')}</p>}
      <label htmlFor={`${id}-q`} className="sr-only">{l('جست‌وجوی خودرو', 'Search vehicles')}</label>
      <Input id={`${id}-q`} placeholder={l('جست‌وجو: پژو، دنا پلاس، ۲۰۶ …', 'Search: Peugeot, Dena Plus, 206 …')} value={q} onChange={(e) => { setQ(e.target.value); setSimilar(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); /* searching never saves the product form */ }} />
      {error ? <Alert tone="danger" title={error} /> : null}
      {similar ? (
        <Alert tone="warning" title={l(`خودرویی با نام خیلی شبیه «${similar.name}» وجود دارد.`, `A vehicle with a very similar name exists: "${similar.name}".`)}>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { toggle(similar.id, null, true); setSimilar(null); setQ(''); }}>{l(`انتخاب «${similar.name}»`, `Use "${similar.name}"`)}</Button>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void quickAdd(true)}>{l(`ساخت «${q.trim()}» به‌عنوان خودروی جدید`, `Create "${q.trim()}" anyway`)}</Button>
          </div>
        </Alert>
      ) : null}
      {q.trim() && !exact && !similar ? (
        <Button size="sm" variant="secondary" className="self-start" loading={busy} onClick={() => void quickAdd()}><Plus aria-hidden className="size-4" /> {l(`افزودن «${q.trim()}» به فهرست خودروها`, `Add "${q.trim()}" to the vehicle list`)}</Button>
      ) : null}
      <div className="max-h-80 overflow-y-auto rounded-[var(--radius-control)] border border-line-soft">
        {shown.length ? (
          <ul className="divide-y divide-line-soft">
            {shown.map((o) => {
              const whole = has(o.id, null);
              return (
                <li key={o.id} className="px-3 py-2">
                  <Checkbox id={`${id}-v-${o.id}`} label={<span><span className="font-semibold">{o.name}</span> <span className="text-xs text-steel">{l('کل خودرو', 'whole vehicle')}{o.category ? ` · ${o.category}` : ''}{o.active ? '' : ` · ${l('غیرفعال', 'inactive')}`}</span></span>} checked={whole} onChange={(e) => toggle(o.id, null, e.target.checked)} />
                  <div className="ms-8 flex flex-wrap gap-x-4">
                    {o.models.filter((m) => m.active || has(o.id, m.id)).map((m) => (
                      <Checkbox key={m.id} id={`${id}-m-${m.id}`} label={m.name} checked={whole || has(o.id, m.id)} disabled={whole} onChange={(e) => toggle(o.id, m.id, e.target.checked)} />
                    ))}
                  </div>
                  {/* Not a <form>: the picker sits inside the product form; Enter adds the model instead of saving the product. */}
                  <div className="ms-8 mt-1 flex items-center gap-2">
                    <label htmlFor={`${id}-nm-${o.id}`} className="sr-only">{l(`مدل تازه برای ${o.name}`, `New model for ${o.name}`)}</label>
                    <Input id={`${id}-nm-${o.id}`} className="h-9 w-36 text-sm" placeholder={l('مدل تازه', 'New model')} value={modelDraft[o.id] ?? ''}
                      onChange={(e) => setModelDraft({ ...modelDraft, [o.id]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addModel(o.id); } }} />
                    <Button size="sm" variant="ghost" type="button" onClick={() => void addModel(o.id)} disabled={!(modelDraft[o.id] ?? '').trim()}>{l('افزودن مدل', 'Add model')}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="p-3 text-sm text-steel">{l('خودرویی پیدا نشد.', 'No vehicle found.')}</p>}
      </div>
    </fieldset>
  );
}
