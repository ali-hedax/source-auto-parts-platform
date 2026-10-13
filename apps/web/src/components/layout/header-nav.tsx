'use client';

import { ClipboardList } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * Main sections under the header. The current section is marked for screen readers
 * (aria-current) and by a Tech Blue rule under its label; the sourcing request, the
 * second way to buy, sits apart at the end of the row.
 */
export function HeaderNav({ items, label }: { items: Array<{ href: string; label: string }>; label: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const request = items.find((i) => i.href === '/request-part');
  const sections = items.filter((i) => i !== request);
  const link = (active: boolean, accent = false) =>
    `relative inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors hover:text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full ${active ? 'text-white after:bg-tech-light' : `${accent ? 'text-tech-light' : 'text-silver/90'} after:bg-transparent hover:after:bg-white/30`}`;
  return (
    <nav aria-label={label} className="container-page flex items-center justify-between gap-4">
      <ul className="-ms-3 flex items-center">
        {sections.map((n) => (
          <li key={n.href}>
            <Link href={n.href} aria-current={isActive(n.href) ? 'page' : undefined} className={link(isActive(n.href))}>
              {n.label}
            </Link>
          </li>
        ))}
      </ul>
      {request ? (
        <Link href={request.href} aria-current={isActive(request.href) ? 'page' : undefined} className={`${link(isActive(request.href), true)} -me-3`}>
          <ClipboardList aria-hidden className="size-4" />
          {request.label}
        </Link>
      ) : null}
    </nav>
  );
}
