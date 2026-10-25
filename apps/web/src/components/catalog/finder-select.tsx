'use client';

import { compactSearchText } from '@hedax/domain';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface FinderOption {
  value: string;
  label: string;
  /** A second line (e.g. the original make or the years). */
  hint?: string;
  /** Extra names it can be found by (aliases, English name); matched with the site's Persian normalization. */
  search?: string[];
}

/**
 * One numbered step of the vehicle finder: a button showing the step and its choice, opening a
 * searchable list (WAI-ARIA combobox + listbox). Typing filters with the site's normalization (ی/ي،
 * ک/ك، digits, spaces, half-spaces); arrows move, Enter picks, Escape closes. A step without data is
 * disabled and says why — it never offers made-up options.
 */
export function FinderSelect({
  step, label, placeholder, options, value, onChange, disabled = false, active = false, status, searchLabel, noMatch, loading = false, locale,
}: {
  step: number; label: string; placeholder: string; options: FinderOption[]; value: string; onChange: (value: string) => void;
  disabled?: boolean; active?: boolean; status?: string | null; searchLabel: string; noMatch: string; loading?: boolean; locale: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const q = compactSearchText(query);
    if (!q) return options;
    return options.filter((o) => [o.label, o.hint ?? '', ...(o.search ?? [])].some((s) => compactSearchText(s).includes(q)));
  }, [options, query]);
  const digits = (n: number) => n.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US');

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    requestAnimationFrame(() => input.current?.focus());
  }, [open, options, value]);
  useEffect(() => { list.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }); }, [cursor]);

  const choose = (o: FinderOption) => { onChange(o.value); setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setCursor(0); }
    else if (e.key === 'End') { e.preventDefault(); setCursor(Math.max(0, filtered.length - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[cursor]; if (o) choose(o); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return <div ref={root} className="vf-step" data-active={active && !disabled} data-filled={Boolean(selected)} data-disabled={disabled}>
    <button ref={trigger} type="button" className="vf-field" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={open ? `${id}-list` : undefined} aria-describedby={status ? `${id}-status` : undefined}
      onClick={() => setOpen((o) => !o)} onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}>
      <span className="vf-number" aria-hidden>{selected ? <Check size={16} strokeWidth={3} /> : digits(step)}</span>
      <span className="vf-text">
        <span className="vf-label">{label}</span>
        <span className="vf-value">{loading ? '…' : selected ? selected.label : placeholder}</span>
      </span>
      <span className="vf-divider" aria-hidden />
      <ChevronDown aria-hidden size={18} className="vf-chevron" />
    </button>
    {open ? <div className="vf-pop">
      <input ref={input} type="text" role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={filtered[cursor] ? `${id}-o${cursor}` : undefined} aria-label={searchLabel} placeholder={searchLabel}
        value={query} onChange={(e) => { setQuery(e.target.value); setCursor(0); }} onKeyDown={onKey} className="vf-search" autoComplete="off" />
      <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="vf-list">
        {filtered.map((o, i) => <li key={o.value} id={`${id}-o${i}`} role="option" aria-selected={o.value === value} data-index={i} data-cursor={i === cursor}
          onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setCursor(i)} onClick={() => choose(o)} className="vf-option">
          <span>{o.label}</span>{o.hint ? <small>{o.hint}</small> : null}
        </li>)}
        {!filtered.length ? <li role="presentation" className="vf-empty">{noMatch}</li> : null}
      </ul>
    </div> : null}
    {status ? <p id={`${id}-status`} className="vf-status" role="status">{status}</p> : null}
  </div>;
}
