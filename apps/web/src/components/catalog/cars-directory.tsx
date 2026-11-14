'use client';

import { compactSearchText } from '@hedax/domain';
import { ClipboardList, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';

export interface CarsGroup { slug: string; name: string; logoUrl: string | null; vehicles: Array<{ slug: string; name: string; search: string[]; count: number }> }

/**
 * Every vehicle, under its brand: vehicles with parts first (with their count), then the rest, which
 * lead to a sourcing request for that vehicle. The search box filters as you type with the site's
 * Persian normalisation (ی/ي، ک/ك، digits, spaces).
 */
export function CarsDirectory({ groups, locale }: { groups: CarsGroup[]; locale: 'fa' | 'en' }) {
  const fa = locale === 'fa';
  const [q, setQ] = useState('');
  const term = compactSearchText(q);
  const shown = useMemo(() => groups
    .map((g) => ({ ...g, vehicles: term ? g.vehicles.filter((v) => [v.name, g.name, ...v.search].some((s) => compactSearchText(s).includes(term))) : g.vehicles }))
    .filter((g) => g.vehicles.length), [groups, term]);
  const total = shown.reduce((n, g) => n + g.vehicles.length, 0);
  const digits = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US');
  return <div className="su-cars">
    <div className="su-cars-search">
      <label htmlFor="cars-search" className="sr-only">{fa ? 'جست‌وجوی نام خودرو' : 'Search vehicles'}</label>
      <Search aria-hidden size={20} />
      <input id="cars-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={fa ? 'نام خودرو را بنویسید؛ مثلاً ۲۰۶ یا تیبا' : 'Type a vehicle name'} autoComplete="off" />
      <p className="su-muted" aria-live="polite">{fa ? `${digits(total)} خودرو` : `${total} vehicles`}</p>
    </div>
    {shown.map((g) => (
      <section key={g.slug} className="su-cars-group" aria-labelledby={`cars-${g.slug}`}>
        <h2 id={`cars-${g.slug}`}>{g.logoUrl ? <img src={g.logoUrl} alt="" width={32} height={32} loading="lazy" /> : null}{g.name}<span>{digits(g.vehicles.length)}</span></h2>
        <ul className="su-cars-grid">
          {g.vehicles.map((v) => (
            <li key={v.slug}>
              {v.count ? (
                <Link href={`/cars/${v.slug}`} className="su-car" data-has-parts>
                  <span className="su-car-name">{v.name}</span>
                  <span className="su-car-count">{fa ? `${digits(v.count)} قطعه` : `${v.count} parts`}</span>
                </Link>
              ) : (
                <Link href={`/request-part?vehicle=${encodeURIComponent(v.name)}`} className="su-car">
                  <span className="su-car-name">{v.name}</span>
                  <span className="su-car-request"><ClipboardList aria-hidden size={16} />{fa ? 'درخواست تأمین' : 'Request a part'}</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    ))}
    {!shown.length ? <div className="su-panel su-cars-empty"><p>{fa ? 'خودرویی با این نام پیدا نشد.' : 'No vehicle matches.'}</p><Link href={`/request-part${q.trim() ? `?vehicle=${encodeURIComponent(q.trim())}` : ''}`} className="su-btn su-btn-primary">{fa ? 'درخواست تأمین قطعه' : 'Request a part'}</Link></div> : null}
  </div>;
}
