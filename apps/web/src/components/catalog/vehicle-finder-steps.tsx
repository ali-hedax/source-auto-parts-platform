'use client';

import type { FinderGroupView, FinderModelView, FinderVehicleView } from '@hedax/contracts';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { FinderSelect, type FinderOption } from './finder-select';

type Load<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; items: T[] } | { state: 'error' };

/**
 * Vehicle finder: group → vehicle → model/trim → year. Each step is fetched only when the previous
 * one is chosen (the page never carries the whole vehicle list), and changing a step clears the
 * later ones. «نمایش قطعات خودرو» opens /parts with the selection in the URL; the server checks it
 * again there. Years come from the model and stay in their own calendar.
 */
export function VehicleFinderSteps({ groups, locale, buttonLabel, requestHref }: { groups: FinderGroupView[]; locale: 'fa' | 'en'; buttonLabel: string; requestHref: string }) {
  const fa = locale === 'fa';
  const name = (n: { fa: string; en: string | null }) => (fa ? n.fa : n.en || n.fa);
  const digits = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US', { useGrouping: false });
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
    api<FinderVehicleView[]>(`/catalog/vehicle-finder/vehicles?group=${encodeURIComponent(g)}`)
      .then((items) => { if (ticket === request.current) setVehicles({ state: 'ready', items }); })
      .catch(() => { if (ticket === request.current) setVehicles({ state: 'error' }); });
  }, []);
  const loadModels = useCallback((g: string, v: string) => {
    const ticket = ++request.current;
    setModels({ state: 'loading' });
    api<FinderModelView[]>(`/catalog/vehicle-finder/models?group=${encodeURIComponent(g)}&vehicle=${encodeURIComponent(v)}`)
      .then((items) => { if (ticket === request.current) setModels({ state: 'ready', items }); })
      .catch(() => { if (ticket === request.current) setModels({ state: 'error' }); });
  }, []);

  const pickGroup = (g: string) => { setGroup(g); setVehicle(''); setModel(''); setYear(''); setModels({ state: 'idle' }); if (g) loadVehicles(g); else setVehicles({ state: 'idle' }); };
  const pickVehicle = (v: string) => { setVehicle(v); setModel(''); setYear(''); if (v) loadModels(group, v); else setModels({ state: 'idle' }); };
  const pickModel = (m: string) => { setModel(m); setYear(''); };
  useEffect(() => () => { request.current++; }, []);

  const groupInfo = groups.find((g) => g.slug === group) ?? null;
  const vehicleItems = vehicles.state === 'ready' ? vehicles.items : [];
  const modelItems = models.state === 'ready' ? models.items : [];
  const vehicleInfo = vehicleItems.find((v) => v.slug === vehicle) ?? null;
  const modelInfo = modelItems.find((m) => m.slug === model) ?? null;
  const calendarName = (c: 'jalali' | 'gregorian') => (c === 'jalali' ? (fa ? 'شمسی' : 'Persian calendar') : (fa ? 'میلادی' : 'Gregorian'));
  const yearOptions: FinderOption[] = modelInfo?.years
    ? Array.from({ length: modelInfo.years.to - modelInfo.years.from + 1 }, (_, i) => modelInfo.years!.to - i).map((y) => ({ value: String(y), label: digits(y), hint: calendarName(modelInfo.years!.calendar), search: [String(y)] }))
    : [];

  const groupOptions: FinderOption[] = groups.map((g) => ({ value: g.slug, label: name(g.name), ...(g.vehicleCount ? {} : { hint: fa ? 'هنوز خودرویی ثبت نشده' : 'No vehicles listed yet' }), search: [g.name.fa, g.name.en ?? ''] }));
  const vehicleOptions: FinderOption[] = vehicleItems.map((v) => ({
    value: v.slug, label: name(v.name),
    ...(v.make && name(v.make) !== name(v.name) ? { hint: fa ? `برند: ${name(v.make)}` : `Make: ${name(v.make)}` } : {}),
    search: [v.name.fa, v.name.en ?? '', ...(v.make ? [v.make.fa, v.make.en ?? ''] : []), ...v.aliases],
  }));
  const modelOptions: FinderOption[] = modelItems.map((m) => ({
    value: m.slug, label: name(m.name),
    ...(m.years ? { hint: `${digits(m.years.from)}–${digits(m.years.to)} ${calendarName(m.years.calendar)}` } : {}),
    search: [m.name.fa, m.name.en ?? '', ...m.aliases],
  }));

  // Why a step cannot be used, in words (no placeholder options).
  const vehicleStatus = !group ? null : vehicles.state === 'error' ? (fa ? 'فهرست خودروها دریافت نشد. دوباره انتخاب کنید.' : 'Could not load the vehicles. Choose the group again.')
    : vehicles.state === 'ready' && !vehicleItems.length ? (fa ? 'برای این گروه هنوز خودرویی ثبت نشده است.' : 'No vehicles are listed for this group yet.') : null;
  const modelStatus = !vehicle ? null : models.state === 'error' ? (fa ? 'فهرست مدل‌ها دریافت نشد. دوباره انتخاب کنید.' : 'Could not load the models. Choose the vehicle again.')
    : models.state === 'ready' && !modelItems.length ? (fa ? 'مدل یا تیپی برای این خودرو ثبت نشده؛ می‌توانید بدون مدل جست‌وجو کنید.' : 'No models are listed for this vehicle; you can search without one.') : null;
  const yearStatus = !model ? null : !modelInfo?.years ? (fa ? 'سال تولید این مدل ثبت نشده؛ بدون سال جست‌وجو کنید.' : 'No model years are recorded for this model; search without a year.') : null;
  const activeStep = !group ? 1 : !vehicle ? 2 : !model && modelItems.length ? 3 : model && yearOptions.length && !year ? 4 : 0;
  const common = { locale, searchLabel: fa ? 'جست‌وجو در فهرست' : 'Search the list', noMatch: fa ? 'موردی پیدا نشد' : 'No match' };

  return <form action={`/${locale}/parts`} method="get" className="vf-form" aria-label={fa ? 'انتخاب خودرو' : 'Choose your vehicle'}>
    <div className="vf-steps">
      <FinderSelect {...common} step={1} label={fa ? 'برند / گروه خودرو' : 'Make / group'} placeholder={fa ? 'انتخاب گروه' : 'Choose a group'} options={groupOptions} value={group} onChange={pickGroup} active={activeStep === 1} />
      <FinderSelect {...common} step={2} label={fa ? 'خودرو' : 'Vehicle'} placeholder={!group ? (fa ? 'ابتدا گروه را انتخاب کنید' : 'Choose a group first') : (fa ? 'انتخاب خودرو' : 'Choose a vehicle')}
        options={vehicleOptions} value={vehicle} onChange={pickVehicle} disabled={!group || !vehicleItems.length} loading={vehicles.state === 'loading'} active={activeStep === 2} status={vehicleStatus} />
      <FinderSelect {...common} step={3} label={fa ? 'مدل / تیپ' : 'Model / trim'} placeholder={!vehicle ? (fa ? 'ابتدا خودرو را انتخاب کنید' : 'Choose a vehicle first') : (fa ? 'انتخاب مدل (اختیاری)' : 'Choose a model (optional)')}
        options={modelOptions} value={model} onChange={pickModel} disabled={!vehicle || !modelItems.length} loading={models.state === 'loading'} active={activeStep === 3} status={modelStatus} />
      <FinderSelect {...common} step={4} label={fa ? 'سال' : 'Year'} placeholder={!model ? (fa ? 'ابتدا مدل را انتخاب کنید' : 'Choose a model first') : (fa ? 'انتخاب سال (اختیاری)' : 'Choose a year (optional)')}
        options={yearOptions} value={year} onChange={setYear} disabled={!yearOptions.length} active={activeStep === 4} status={yearStatus} />
    </div>
    {group ? <input type="hidden" name="group" value={group} /> : null}
    {vehicle ? <input type="hidden" name="vehicle" value={vehicle} /> : null}
    {model ? <input type="hidden" name="model" value={model} /> : null}
    {year ? <input type="hidden" name="year" value={year} /> : null}
    <div className="vf-actions">
      <button type="submit" className="vf-submit" disabled={!vehicle}><Search aria-hidden size={18} />{buttonLabel}</button>
      <a className="vf-help" href={requestHref}>{fa ? 'خودروی خود را در فهرست پیدا نکردید؟ درخواست تأمین ثبت کنید' : 'Can’t find your vehicle? Send a sourcing request'}</a>
    </div>
    {!vehicle ? <p className="vf-hint">{groupInfo && !groupInfo.vehicleCount ? (fa ? `برای ${name(groupInfo.name)} هنوز خودرویی ثبت نشده است.` : `No vehicles are listed for ${name(groupInfo.name)} yet.`) : (fa ? 'برای نمایش قطعات، دست‌کم گروه و خودرو را انتخاب کنید.' : 'Choose at least the group and the vehicle to see parts.')}</p>
      : vehicleInfo?.make ? <p className="vf-hint">{fa ? `برند اصلی: ${name(vehicleInfo.make)} · گروه: ${name(groupInfo!.name)}` : `Make: ${name(vehicleInfo.make)} · group: ${name(groupInfo!.name)}`}</p> : null}
  </form>;
}
