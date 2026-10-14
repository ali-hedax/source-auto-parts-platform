'use client';

import { MoreVertical } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface MenuAction {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * The ⋮ menu next to a row: a button that opens a short list of actions. Keyboard: arrows move,
 * Escape closes and returns focus to the button; a click outside closes it.
 */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    const first = menu.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus();
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const onKey = (e: KeyboardEvent) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === 'Tab') setOpen(false);
  };
  if (!actions.length) return null;
  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className="grid size-11 cursor-pointer place-items-center rounded-[var(--radius-control)] text-steel hover:bg-silver/60 hover:text-ink"
      >
        <MoreVertical aria-hidden className="size-5" />
      </button>
      {open ? (
        <ul ref={menu} id={id} role="menu" aria-label={label} onKeyDown={onKey} className="absolute end-0 top-full z-30 mt-1 min-w-52 rounded-[var(--radius-card)] border border-line-soft bg-white py-1 shadow-[var(--shadow-overlay)]">
          {actions.map((a) => (
            <li key={a.key} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={() => { setOpen(false); a.onSelect(); }}
                className={`block min-h-11 w-full cursor-pointer px-4 py-2 text-start text-sm hover:bg-surface focus:bg-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${a.danger ? 'text-danger' : 'text-ink'}`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
