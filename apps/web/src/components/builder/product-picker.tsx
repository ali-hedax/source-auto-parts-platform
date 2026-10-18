'use client';
import { useEffect, useState } from 'react';
import type { ProductCard, SearchResult } from '@hedax/contracts';
import { api } from '@/lib/api/client';
export function ProductPicker({ selected, onChange }: { selected: string[]; onChange: (slugs: string[]) => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProductCard[]>([]);
  useEffect(() => { let active = true; const timer = setTimeout(() => { void api<SearchResult>(`/catalog/products?q=${encodeURIComponent(search)}&pageSize=12`).then(r => { if (active) setResults(r.items); }).catch(() => undefined); }, 300); return () => { active = false; clearTimeout(timer); }; }, [search]);
  return <div><label>انتخاب کالا از فروشگاه<input value={search} onChange={e => setSearch(e.target.value)} placeholder="نام یا شماره فنی کالا" /></label><p className="text-xs">{selected.length} کالا انتخاب شده</p><ul>{results.map(p => <li key={p.id}><label className="!flex-row items-center"><input type="checkbox" checked={selected.includes(p.slug)} disabled={!selected.includes(p.slug) && selected.length >= 24} onChange={e => onChange(e.target.checked ? [...selected, p.slug] : selected.filter(s => s !== p.slug))} /><span>{p.name.fa}<small className="block text-steel">{p.sku}</small></span></label></li>)}</ul>{selected.length ? <button type="button" className="min-h-11 text-sm text-action" onClick={() => onChange([])}>پاک کردن انتخاب‌ها</button> : null}</div>;
}
