'use client';

import type { ProductCard } from '@hedax/contracts';
import { CarFront, ClipboardList, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

type Chip = { href: string; label: string };

/**
 * Full-width quick search under the opening film: name, part number or SKU with live suggestions,
 * plus one-tap shortcuts so a visitor reaches the right parts without typing. Works without
 * JavaScript too (a plain GET form to /parts?q=).
 */
export function QuickSearch({ locale, categories }: { locale: 'fa' | 'en'; categories: Chip[] }) {
  const fa = locale === 'fa';
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ProductCard[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems([]); return; }
    const seq = ++latest.current;
    const timer = window.setTimeout(async () => {
      try {
        const r = await api<{ items: ProductCard[] }>(`/catalog/products?q=${encodeURIComponent(term)}&pageSize=6&sort=relevance`);
        if (seq === latest.current) { setItems(r.items); setOpen(true); setActive(-1); }
      } catch { if (seq === latest.current) setItems([]); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const go = (term: string) => { const t = term.trim(); if (t) router.push(`/parts?q=${encodeURIComponent(t.slice(0, 120))}`); };
  const shortcuts: Chip[] = [
    { href: '#vehicle-finder', label: fa ? 'انتخاب خودرو' : 'Choose vehicle' },
    ...categories.slice(0, 8),
    { href: '/request-part', label: fa ? 'قطعه را پیدا نکردید؟ درخواست تأمین' : 'Can’t find it? Request a part' },
  ];

  return (
    <section className="titanium-quick-search" aria-labelledby="quick-search-title">
      <div className="container-page">
        <div className="titanium-float titanium-quick-search-panel">
          <h2 id="quick-search-title" className="titanium-quick-search-title">{fa ? 'جست‌وجوی سریع قطعه' : 'Quick part search'}</h2>
          <form action={`/${locale}/parts`} method="get" role="search" className="titanium-quick-search-form" onSubmit={(e) => { e.preventDefault(); go(active >= 0 && items[active] ? (items[active]!.partNumber || items[active]!.sku) : q); }}>
            <Search aria-hidden size={22} className="titanium-quick-search-icon" />
            <label htmlFor="quick-search-input" className="sr-only">{fa ? 'نام قطعه، شماره فنی یا کد کالا' : 'Part name, part number or SKU'}</label>
            <input
              id="quick-search-input" name="q" type="search" dir="auto" autoComplete="off" maxLength={120} value={q}
              placeholder={fa ? 'نام قطعه، شماره فنی یا کد کالا' : 'Part name, part number or SKU'}
              role="combobox" aria-expanded={open && items.length > 0} aria-controls={listId} aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              onChange={(e) => setQ(e.target.value)} onFocus={() => items.length && setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(items.length - 1, a + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
                else if (e.key === 'Escape') setOpen(false);
              }}
            />
            <button type="submit" className="titanium-quick-search-submit">{fa ? 'جست‌وجو' : 'Search'}</button>
            {open && items.length ? (
              <ul id={listId} role="listbox" className="titanium-quick-search-results" aria-label={fa ? 'پیشنهادها' : 'Suggestions'}>
                {items.map((p, i) => (
                  <li key={p.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                    <Link href={`/parts/${p.slug}`} className={i === active ? 'is-active' : undefined} onMouseDown={(e) => e.preventDefault()}>
                      <span className="titanium-quick-search-name" dir="auto">{fa ? p.name.fa : p.name.en || p.name.fa}</span>
                      <bdi dir="ltr" className="titanium-quick-search-code">{p.partNumber || p.sku}</bdi>
                    </Link>
                  </li>
                ))}
                <li role="option" aria-selected={false}><button type="submit" className="titanium-quick-search-all" onMouseDown={(e) => e.preventDefault()}>{fa ? `همهٔ نتیجه‌ها برای «${q.trim()}»` : `All results for “${q.trim()}”`}</button></li>
              </ul>
            ) : null}
          </form>
          <nav className="titanium-quick-search-chips" aria-label={fa ? 'دسترسی سریع' : 'Shortcuts'}>
            {shortcuts.map((c, i) => c.href.startsWith('#')
              ? <a key={c.href} href={c.href} className="titanium-quick-chip"><CarFront aria-hidden size={16} />{c.label}</a>
              : <Link key={`${c.href}-${i}`} href={c.href} className={`titanium-quick-chip ${c.href === '/request-part' ? 'is-request' : ''}`}>{c.href === '/request-part' ? <ClipboardList aria-hidden size={16} /> : null}{c.label}</Link>)}
          </nav>
        </div>
      </div>
    </section>
  );
}
