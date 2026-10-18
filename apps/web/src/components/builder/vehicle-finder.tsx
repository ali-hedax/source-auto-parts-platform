'use client';
import { useState } from 'react';
import type { VehicleBrandView, VehiclePublicView } from '@hedax/contracts';
export function VehicleFinder({ vehicles, brands, byBrand, locale }: { vehicles: VehiclePublicView[]; brands: VehicleBrandView[]; byBrand: boolean; locale: string }) {
  const [vehicle, setVehicle] = useState('');
  const names = (n: { fa: string; en: string | null }) => locale === 'en' ? n.en || n.fa : n.fa;
  const style = 'min-h-12 min-w-0 w-full rounded-xl border bg-white px-3 text-ink';
  return <form action={`/${locale}/parts`} method="get" className="grid items-end gap-3 sm:grid-cols-3">
    {byBrand ? <label>{locale === 'fa' ? 'برند خودرو' : 'Car brand'}<select name="brand" className={style} required defaultValue=""><option value="">{locale === 'fa' ? 'انتخاب برند' : 'Choose a brand'}</option>{brands.map(b => <option key={b.slug} value={b.slug}>{names(b.name)}</option>)}</select></label> : <>
      <label>{locale === 'fa' ? 'خودرو' : 'Vehicle'}<select name="vehicle" className={style} required value={vehicle} onChange={e => setVehicle(e.target.value)}><option value="">{locale === 'fa' ? 'انتخاب خودرو' : 'Choose a vehicle'}</option>{vehicles.map(v => <option key={v.slug} value={v.slug}>{names(v.name)}</option>)}</select></label>
      <label>{locale === 'fa' ? 'مدل خودرو' : 'Vehicle model'}<select key={vehicle} name="model" className={style} defaultValue=""><option value="">{locale === 'fa' ? 'همهٔ مدل‌ها' : 'All models'}</option>{vehicles.find(v => v.slug === vehicle)?.models.map(m => <option key={m.slug} value={m.slug}>{names(m.name)}</option>)}</select></label>
    </>}
    <button type="submit" className="builder-button">{locale === 'fa' ? 'نمایش قطعات سازگار' : 'Find compatible parts'}</button>
  </form>;
}
