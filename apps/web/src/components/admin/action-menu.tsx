'use client';

import { MoreVertical } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface MenuAction {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const GAP = 4;
const EDGE = 8;

/**
 * The ⋮ menu next to a row: a button that opens a short list of actions. Keyboard: arrows move,
 * Escape closes and returns focus to the button; a click outside closes it.
 *
 * The list is drawn on top of the page (a portal with fixed position), not inside the row: a table
 * scrolls sideways in its own box, which would otherwise cut off the lower items of a menu opened
 * near the bottom (e.g. «انتقال به سطل زباله» under «فعال کردن حساب»). It opens below the button,
 * or above it when there is not enough room below, and follows the button while the page scrolls.
 */
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);

  const place = useCallback(() => {
    const b = button.current;
    const m = menu.current;
    if (!b || !m) return;
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const h = m.scrollHeight;
    const w = m.offsetWidth;
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = h > below && above > below;
    // The menu's end edge lines up with the button's end edge (right in English, left in Persian).
    const rtl = getComputedStyle(b).direction === 'rtl';
    const left = Math.min(Math.max(EDGE, rtl ? r.left : r.right - w), Math.max(EDGE, vw - w - EDGE));
    setStyle({
      position: 'fixed',
      left,
      ...(up ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }),
      // Very long menus on very small screens scroll inside themselves instead of leaving the screen.
      maxHeight: Math.max(up ? above : below, 120),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
    else setStyle({ visibility: 'hidden' });
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const first = menu.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus({ preventScroll: true });
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

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
    } else if (e.key === 'Tab') {
      // The list lives at the end of the page; Tab goes back to the row it belongs to.
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    }
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
      {open
        ? createPortal(
            <ul ref={menu} id={id} role="menu" aria-label={label} onKeyDown={onKey} style={style} className="z-40 min-w-52 overflow-y-auto rounded-[var(--radius-card)] border border-line-soft bg-white py-1 shadow-[var(--shadow-overlay)]">
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
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
