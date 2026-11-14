'use client';
import '@/components/builder/vehicle-finder.css';

import type { FinderGroupView, FinderModelView, FinderVehicleView, YearCalendar } from '@hedax/contracts';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { FinderSelect, type FinderOption } from './finder-select';

type Load<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; items: T[] } | { state: 'error' };
export interface VehicleChoice { group: string; vehicle: string; model: string }

/**
 * Three-step vehicle choice — brand → vehicle → model (its years shown beside it) — loaded one step at a
 * time, so no page carries the whole vehicle list. `form` (home page): a GET form to /parts with
 * «نمایش قطعات». `filter` (catalogue): every change is reported at once through `onChange`.
 * Steps are optional and changing one clears the later ones.
 */
export function VehicleSteps({ groups, locale, mode, initial, onChange, buttonLabel, idPrefix = 'vs' }: {
  groups: FinderGroupView[]; locale: 'fa' | 'en'; mode: 'form' | 'filter'; initial?: Partial<VehicleChoice>;
  onChange?: (choice: VehicleChoice) => void; buttonLabel?: string; idPrefix?: string;
}) {
  const fa = locale === 'fa';
  const name = (n: { fa: string; en: string | null }) => (fa ? n.fa : n.en || n.fa);
  const digits = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US', { useGrouping: false });
  const [group, setGroup] = useState(initial?.group ?? '');
  const [vehicle, setVehicle] = useState(initial?.vehicle ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [vehicles, setVehicles] = useState<Load<FinderVehicleView>>({ state: 'idle' });
  const [models, setModels] = useState<Load<FinderModelView>>({ state: 'idle' });
  const ticket = useRef({ vehicles: 0, models: 0 });

  const loadVehicles = useCallback((g: string) => {
    const n = ++ticket.current.vehicles;
    setVehicles({ state: 'loading' });
    api<FinderVehicleView[]>(`/catalog/vehicle-finder/vehicles${g ? `?group=${encodeURIComponent(g)}` : ''}`)
      .then((items) => { if (n === ticket.current.vehicles) setVehicles({ state: 'ready', items }); })
      .catch(() => { if (n === ticket.current.vehicles) setVehicles({ state: 'error' }); });
  }, []);
  const loadModels = useCallback((v: string) => {
    const n = ++ticket.current.models;
    setModels({ state: 'loading' });
    api<FinderModelView[]>(`/catalog/vehicle-finder/models?vehicle=${encodeURIComponent(v)}`)
      .then((items) => { if (n === ticket.current.models) setModels({ state: 'ready', items }); })
      .catch(() => { if (n === ticket.current.models) setModels({ state: 'error' }); });
  }, []);

  // A choice already in the address (catalogue filter) loads its lists once.
  useEffect(() => {
    if (initial?.group || initial?.vehicle) loadVehicles(initial.group ?? '');
    if (initial?.vehicle) loadModels(initial.vehicle);
  }, [initial?.group, initial?.vehicle, loadVehicles, loadModels]);

  const report = (choice: VehicleChoice) => { if (mode === 'filter') onChange?.(choice); };
  const pickGroup = (g: string) => {
    setGroup(g); setVehicle(''); setModel(''); setModels({ state: 'idle' });
    if (g) loadVehicles(g); else setVehicles({ state: 'idle' });
    report({ group: g, vehicle: '', model: '' });
  };
  const openVehicles = () => { if (!group && vehicles.state !== 'ready' && vehicles.state !== 'loading') loadVehicles(''); };
  const vehicleItems = vehicles.state === 'ready' ? vehicles.items : [];
  const pickVehicle = (v: string) => {
    // A vehicle chosen first fills in its brand.
    const g = v && !group ? (vehicleItems.find((x) => x.slug === v)?.groups[0] ?? '') : group;
    setGroup(g); setVehicle(v); setModel('');
    if (v) loadModels(v); else setModels({ state: 'idle' });
    report({ group: g, vehicle: v, model: '' });
  };
  const pickModel = (m: string) => { setModel(m); report({ group, vehicle, model: m }); };

  const modelItems = models.state === 'ready' ? models.items : [];
  const calendarName = (c: YearCalendar) => (c === 'jalali' ? (fa ? 'شمسی' : 'Persian') : (fa ? 'میلادی' : 'Gregorian'));
  const groupOptions: FinderOption[] = groups.map((g) => ({ value: g.slug, label: name(g.name), search: [g.name.fa, g.name.en ?? ''] }));
  const vehicleOptions: FinderOption[] = vehicleItems.map((v) => {
    const make = v.make && name(v.make) !== name(v.name) ? name(v.make) : '';
    return { value: v.slug, label: name(v.name), ...(make ? { hint: make } : {}), search: [v.name.fa, v.name.en ?? '', ...(v.make ? [v.make.fa, v.make.en ?? ''] : []), ...v.aliases] };
  });
  const modelOptions: FinderOption[] = modelItems.map((m) => ({
    value: m.slug, label: name(m.name),
    ...(m.years ? { hint: `${digits(m.years.from)}–${digits(m.years.to)} ${calendarName(m.years.calendar)}` } : {}),
    search: [m.name.fa, m.name.en ?? '', ...m.aliases],
  }));
  const vehicleStatus = vehicles.state === 'error' ? (fa ? 'فهرست خودروها دریافت نشد.' : 'Could not load vehicles.')
    : group && vehicles.state === 'ready' && !vehicleItems.length ? (fa ? 'برای این برند خودرویی ثبت نشده.' : 'No vehicles for this brand yet.') : null;
  const modelStatus = !vehicle ? null : models.state === 'error' ? (fa ? 'فهرست مدل‌ها دریافت نشد.' : 'Could not load models.')
    : models.state === 'ready' && !modelItems.length ? (fa ? 'مدلی ثبت نشده؛ بدون مدل ادامه دهید.' : 'No models listed.') : null;
  const common = { locale, searchLabel: fa ? 'جست‌وجو در فهرست' : 'Search the list', noMatch: fa ? 'موردی پیدا نشد' : 'No match', clearLabel: fa ? '— همه —' : '— All —', loadingText: fa ? 'در حال دریافت…' : 'Loading…' };

  const steps = <div className="su-steps">
    <FinderSelect {...common} step={1} label={fa ? 'برند' : 'Brand'} placeholder={fa ? 'انتخاب برند' : 'Choose a brand'} options={groupOptions} value={group} onChange={pickGroup} active={!group && !vehicle} />
    <FinderSelect {...common} step={2} label={fa ? 'خودرو' : 'Vehicle'} placeholder={fa ? 'انتخاب خودرو' : 'Choose a vehicle'} options={vehicleOptions} value={vehicle}
      onChange={pickVehicle} onOpen={openVehicles} disabled={Boolean(group) && vehicles.state === 'ready' && !vehicleItems.length} loading={vehicles.state === 'loading'} active={Boolean(group) && !vehicle} status={vehicleStatus} />
    <FinderSelect {...common} step={3} label={fa ? 'مدل و سال' : 'Model & year'} placeholder={!vehicle ? (fa ? 'ابتدا خودرو' : 'Vehicle first') : (fa ? 'همهٔ مدل‌ها' : 'All models')}
      options={modelOptions} value={model} onChange={pickModel} disabled={!vehicle || !modelItems.length} loading={models.state === 'loading'} active={Boolean(vehicle) && !model && modelItems.length > 0} status={modelStatus} />
  </div>;

  if (mode === 'filter') return <div className="su-vehicle-filter" id={idPrefix}>{steps}</div>;
  return <form action={`/${locale}/parts`} method="get" className="su-vehicle-form" id={idPrefix} aria-label={fa ? 'انتخاب خودرو' : 'Choose your vehicle'}>
    {steps}
    {group ? <input type="hidden" name="group" value={group} /> : null}
    {vehicle ? <input type="hidden" name="vehicle" value={vehicle} /> : null}
    {model ? <input type="hidden" name="model" value={model} /> : null}
    <button type="submit" className="su-btn su-btn-primary su-vehicle-submit" disabled={!group && !vehicle}><Search aria-hidden size={18} />{buttonLabel ?? (fa ? 'نمایش قطعات' : 'Show parts')}</button>
  </form>;
}
