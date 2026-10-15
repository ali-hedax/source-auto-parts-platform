'use client';

import { clsx } from 'clsx';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Num } from './format';

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  /** Shown as a small count after the label (e.g. items in the trash). */
  count?: number;
}

/**
 * Tabs (WAI-ARIA tab pattern): arrow keys move between tabs (mirrored in RTL by the browser's
 * reading order), Home/End jump to the ends. The panel is rendered by the caller with
 * `id={`${id}-panel`}` and `aria-labelledby={`${id}-${active}`}`.
 */
export function Tabs<K extends string>({ id, label, items, active, onChange }: { id: string; label: string; items: ReadonlyArray<TabItem<K>>; active: K; onChange: (key: K) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (e: KeyboardEvent, index: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const next: Record<string, number> = { ArrowRight: rtl ? index - 1 : index + 1, ArrowLeft: rtl ? index + 1 : index - 1, Home: 0, End: items.length - 1 };
    const to = next[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const i = (to + items.length) % items.length;
    onChange(items[i]!.key);
    refs.current[i]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map((item, index) => {
        const selected = item.key === active;
        return (
          <button
            key={item.key}
            ref={(el) => { refs.current[index] = el; }}
            id={`${id}-${item.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${id}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => move(e, index)}
            className={clsx(
              '-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action',
              selected ? 'border-action text-action' : 'border-transparent text-steel hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className={clsx('num rounded-full px-2 text-xs leading-5', selected ? 'bg-action text-white' : 'bg-surface text-steel')}><Num value={item.count} /></span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
