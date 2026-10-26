'use client';

import type { FinderGroupView, FinderModelView, FinderVehicleView, YearCalendar } from '@hedax/contracts';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { FinderSelect, type FinderOption } from './finder-select';

type Load<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; items: T[]; group: string } | { state: 'error' };

/**
 * Part search and vehicle finder: a free-text search (part name, code, technical number) and four
 * optional steps — group → vehicle → model/trim → year. Any combination searches; the server ranks
 * the results (verified fitment first, suggestions clearly labelled). Lists load only when needed (the
 * page never carries the whole vehicle list); changing a step clears the later ones. Years come from
 * the model (or the vehicle's models) and stay in their own calendar.
 */
export function VehicleFinderSteps({ groups, locale, buttonLabel, requestHref }: { groups: FinderGroupView[]; locale: 'fa' | 'en'; buttonLabel: string; requestHref: string }) {
  const fa = locale === 'fa';
  const name = (n: { fa: string; en: string | null }) => (fa ? n.fa : n.en || n.fa);
  const digits = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US', { useGrouping: false });
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [vehicles, setVehicles] = useState<Load<FinderVehicleView>>({ state: 'idle' });
  const [models, setModels] = useState<Load<FinderModelView>>({ state: 'idle' });
  const request = useRef(0);

  const loadVehicles = useCallback((g: string) => {
    const ticket = ++request.current;
    setVehicles({ state: 'loading' });
    api<FinderVehicleView[]>(`/catalog/vehicle-finder/vehicles${g ? `?group=${encodeURIComponent(g)}` : ''}`)
      .then((items) => { if (ticket === request.current) setVehicles({ state: 'ready', items, group: g }); })
      .catch(() => { if (ticket === request.current) setVehicles({ state: 'error' }); });
  }, []);
  const loadModels = useCallback((v: string) => {
    const ticket = ++request.current;
    setModels({ state: 'loading' });
    api<FinderModelView[]>(`/catalog/vehicle-finder/models?vehicle=${encodeURIComponent(v)}`)
      .then((items) => { if (ticket === request.current) setModels({ state: 'ready', items, group: '' }); })
      .catch(() => { if (ticket === request.current) setModels({ state: 'error' }); });
  }, []);

  const clearAfterGroup = () => { setVehicle(''); setModel(''); setYear(''); setModels({ state: 'idle' }); };
  const pickGroup = (g: string) => {
    setGroup(g); clearAfterGroup();
    if (g) loadVehicles(g); else setVehicles({ state: 'idle' });
  };
  // Without a group the vehicle list (every group) loads when the step is opened.
  const openVehicles = () => { if (!group && (vehicles.state === 'idle' || vehicles.state === 'error' || (vehicles.state === 'ready' && vehicles.group))) loadVehicles(''); };
  const vehicleItems = vehicles.state === 'ready' ? vehicles.items : [];
  const pickVehicle = (v: string) => {
    setVehicle(v); setModel(''); setYear('');
    // A vehicle chosen first fills in its group (its first one when it has two).
    if (v && !group) setGroup(vehicleItems.find((x) => x.slug === v)?.groups[0] ?? '');
    if (v) loadModels(v); else setModels({ state: 'idle' });
  };
  const pickModel = (m: string) => { setModel(m); setYear(''); };
  useEffect(() => () => { request.current++; }, []);

  const groupInfo = groups.find((g) => g.slug === group) ?? null;
  const modelItems = models.state === 'ready' ? models.items : [];
  const vehicleInfo = vehicleItems.find((v) => v.slug === vehicle) ?? null;
  const modelInfo = modelItems.find((m) => m.slug === model) ?? null;
  const calendarName = (c: YearCalendar) => (c === 'jalali' ? (fa ? 'شمسی' : 'Persian calendar') : (fa ? 'میلادی' : 'Gregorian'));
  // Years of the chosen model, or the span of the vehicle's models in one calendar (never mixed).
  const span = modelInfo ? modelInfo.years : (() => {
    const known = modelItems.map((m) => m.years).filter((y): y is NonNullable<typeof y> => !!y);
    const calendar = known[0]?.calendar;
    const same = known.filter((y) => y.calendar === calendar);
    return calendar && same.length ? { from: Math.min(...same.map((y) => y.from)), to: Math.max(...same.map((y) => y.to)), calendar } : null;
  })();
  const yearOptions: FinderOption[] = vehicle && span
    ? Array.from({ length: span.to - span.from + 1 }, (_, i) => span.to - i).map((y) => ({ value: String(y), label: digits(y), hint: calendarName(span.calendar), search: [String(y)] }))
    : [];

  const groupOptions: FinderOption[] = groups.map((g) => ({ value: g.slug, label: name(g.name), ...(g.vehicleCount ? {} : { hint: fa ? 'هنوز خودرویی ثبت نشده' : 'No vehicles listed yet' }), search: [g.name.fa, g.name.en ?? ''] }));
  const groupName = (slug: string) => { const g = groups.find((x) => x.slug === slug); return g ? name(g.name) : ''; };
  const vehicleOptions: FinderOption[] = vehicleItems.map((v) => {
    const make = v.make && name(v.make) !== name(v.name) ? name(v.make) : '';
    const hint = group ? (make ? (fa ? `برند: ${make}` : `Make: ${make}`) : '') : [make, ...v.groups.map(groupName)].filter(Boolean).join(' · ');
    return { value: v.slug, label: name(v.name), ...(hint ? { hint } : {}), search: [v.name.fa, v.name.en ?? '', ...(v.make ? [v.make.fa, v.make.en ?? ''] : []), ...v.aliases] };
  });
  const modelOptions: FinderOption[] = modelItems.map((m) => ({
    value: m.slug, label: name(m.name),
    ...(m.years ? { hint: `${digits(m.years.from)}–${digits(m.years.to)} ${calendarName(m.years.calendar)}` } : {}),
    search: [m.name.fa, m.name.en ?? '', ...m.aliases],
  }));

  // Why a step has nothing to offer, in words (no placeholder options).
  const vehicleStatus = vehicles.state === 'error' ? (fa ? 'فهرست خودروها دریافت نشد. دوباره تلاش کنید.' : 'Could not load the vehicles. Try again.')
    : group && vehicles.state === 'ready' && !vehicleItems.length ? (fa ? 'برای این گروه هنوز خودرویی ثبت نشده است.' : 'No vehicles are listed for this group yet.') : null;
  const modelStatus = !vehicle ? null : models.state === 'error' ? (fa ? 'فهرست مدل‌ها دریافت نشد. خودرو را دوباره انتخاب کنید.' : 'Could not load the models. Choose the vehicle again.')
    : models.state === 'ready' && !modelItems.length ? (fa ? 'مدل یا تیپی برای این خودرو ثبت نشده؛ بدون مدل جست‌وجو کنید.' : 'No models are listed for this vehicle; search without one.') : null;
  const yearStatus = !vehicle || models.state !== 'ready' ? null : !yearOptions.length ? (fa ? 'سال ساخت معتبری برای این انتخاب ثبت نشده؛ بدون سال جست‌وجو کنید.' : 'No verified model years are recorded for this choice; search without a year.') : null;
  const canSearch = Boolean(q.trim() || group || vehicle);
  const common = { locale, searchLabel: fa ? 'جست‌وجو در فهرست' : 'Search the list', noMatch: fa ? 'موردی پیدا نشد' : 'No match', clearLabel: fa ? '— بدون انتخاب —' : '— No choice —', loadingText: fa ? 'در حال دریافت…' : 'Loading…' };
  const optional = fa ? '(اختیاری)' : '(optional)';

  return <form action={`/${locale}/parts`} method="get" className="vf-form" role="search" aria-label={fa ? 'جست‌وجوی قطعه و انتخاب خودرو' : 'Part search and vehicle finder'}>
    <label className="vf-query">
      <span className="sr-only">{fa ? 'نام قطعه، کد کالا یا شماره فنی' : 'Part name, SKU or part number'}</span>
      <Search aria-hidden size={20} className="vf-query-icon" />
      <input id="part-search" name={q.trim() ? 'q' : undefined} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search"
        placeholder={fa ? 'نام قطعه، کد کالا یا شماره فنی' : 'Part name, SKU or part number'} />
    </label>
    <div className="vf-steps">
      <FinderSelect {...common} step={1} label={`${fa ? 'برند / گروه خودرو' : 'Make / group'} ${optional}`} placeholder={fa ? 'همهٔ گروه‌ها' : 'All groups'} options={groupOptions} value={group}
        onChange={pickGroup} active={!group && !vehicle && !q.trim()} />
      <FinderSelect {...common} step={2} label={`${fa ? 'خودرو' : 'Vehicle'} ${optional}`} placeholder={fa ? 'انتخاب خودرو' : 'Choose a vehicle'}
        options={vehicleOptions} value={vehicle} onChange={pickVehicle} onOpen={openVehicles} disabled={Boolean(group) && vehicles.state === 'ready' && !vehicleItems.length}
        loading={vehicles.state === 'loading'} active={Boolean(group) && !vehicle} status={vehicleStatus} />
      <FinderSelect {...common} step={3} label={`${fa ? 'مدل / تیپ' : 'Model / trim'} ${optional}`} placeholder={!vehicle ? (fa ? 'ابتدا خودرو را انتخاب کنید' : 'Choose a vehicle first') : (fa ? 'همهٔ مدل‌ها' : 'All models')}
        options={modelOptions} value={model} onChange={pickModel} disabled={!vehicle || !modelItems.length} loading={models.state === 'loading'} active={Boolean(vehicle) && !model && modelItems.length > 0} status={modelStatus} />
      <FinderSelect {...common} step={4} label={`${fa ? 'سال ساخت' : 'Year'} ${optional}`} placeholder={!vehicle ? (fa ? 'ابتدا خودرو را انتخاب کنید' : 'Choose a vehicle first') : (fa ? 'همهٔ سال‌ها' : 'All years')}
        options={yearOptions} value={year} onChange={setYear} disabled={!yearOptions.length} active={false} status={yearStatus} />
    </div>
    {group ? <input type="hidden" name="group" value={group} /> : null}
    {vehicle ? <input type="hidden" name="vehicle" value={vehicle} /> : null}
    {model ? <input type="hidden" name="model" value={model} /> : null}
    {year ? <input type="hidden" name="year" value={year} /> : null}
    <div className="vf-actions">
      <button type="submit" className="vf-submit" disabled={!canSearch}><Search aria-hidden size={18} />{buttonLabel}</button>
      <a className="vf-help" href={requestHref}>{fa ? 'قطعه یا خودروی خود را پیدا نکردید؟ درخواست تأمین ثبت کنید' : 'Can’t find your part or vehicle? Send a sourcing request'}</a>
    </div>
    <p className="vf-hint">{vehicleInfo?.make && groupInfo
      ? (fa ? `برند اصلی: ${name(vehicleInfo.make)} · گروه: ${name(groupInfo.name)}` : `Make: ${name(vehicleInfo.make)} · group: ${name(groupInfo.name)}`)
      : (fa ? 'همهٔ گزینه‌ها اختیاری‌اند؛ قطعات با سازگاری تأییدشده اول نمایش داده می‌شوند.'
        : 'Every choice is optional; parts with verified fitment come first.')}</p>
  </form>;
}
