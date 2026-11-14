'use client';

import type { ProductCard } from '@hedax/contracts';
import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { persianText } from '@/lib/persian-text';

/**
 * Part search (name, technical number or SKU) with live suggestions: the header box on every page,
 * the large box in the home hero and on the 404 page. Without JavaScript it is a plain GET form to
 * /parts?q=, so it always works.
 */
export function PartSearch({ locale, variant = 'header', autoFocus = false, idPrefix }: { locale: 'fa' | 'en'; variant?: 'header' | 'hero'; autoFocus?: boolean; idPrefix?: string }) {
  const fa = locale === 'fa';
  const router = useRouter();
  const auto = useId();
  const base = idPrefix ?? `ps${auto.replace(/[^a-zA-Z0-9]/g, '')}`;
  const listId = `${base}-list`;
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ProductCard[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef(0);
  const placeholder = fa ? 'نام قطعه، شماره فنی یا کد کالا' : 'Part name, part number or SKU';

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

  return (
    <form action={`/${locale}/parts`} method="get" role="search" className={`su-search su-search-${variant}`}
      onSubmit={(e) => { e.preventDefault(); go(active >= 0 && items[active] ? (items[active]!.partNumber || items[active]!.sku) : q); }}>
      <label htmlFor={`${base}-input`} className="sr-only">{placeholder}</label>
      <Search aria-hidden size={20} className="su-search-icon" />
      <input
        id={`${base}-input`} name="q" type="search" dir="auto" autoComplete="off" maxLength={120} value={q} enterKeyHint="search"
        placeholder={placeholder} autoFocus={autoFocus}
        role="combobox" aria-expanded={open && items.length > 0} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => setQ(e.target.value)} onFocus={() => items.length && setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(items.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(-1, a - 1)); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button type="submit" className={variant === 'hero' ? 'su-btn su-btn-primary' : 'su-search-submit'} aria-label={variant === 'hero' ? undefined : (fa ? 'جست‌وجو' : 'Search')}>
        {variant === 'hero' ? (fa ? 'جست‌وجو' : 'Search') : <Search aria-hidden size={18} />}
      </button>
      {open && items.length ? (
        <ul id={listId} role="listbox" className="su-search-results" aria-label={fa ? 'پیشنهادها' : 'Suggestions'}>
          {items.map((p, i) => (
            <li key={p.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <Link href={`/parts/${p.slug}`} className={i === active ? 'is-active' : undefined} onMouseDown={(e) => e.preventDefault()}>
                <span className="su-search-name" dir="auto">{persianText(fa ? p.name.fa : p.name.en || p.name.fa)}</span>
                <bdi dir="ltr" className="su-search-code">{p.partNumber || p.sku}</bdi>
              </Link>
            </li>
          ))}
          <li role="option" aria-selected={false}><button type="submit" className="su-search-all" onMouseDown={(e) => e.preventDefault()}>{fa ? `همهٔ نتیجه‌ها برای «${q.trim()}»` : `All results for “${q.trim()}”`}</button></li>
        </ul>
      ) : null}
    </form>
  );
}
