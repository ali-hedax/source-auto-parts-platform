'use client';

import { Link, usePathname } from '@/i18n/navigation';

/** Main sections in the header's second row; the current one is marked (aria-current and a blue rule). */
export function HeaderNav({ items, label }: { items: Array<{ href: string; label: string }>; label: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav aria-label={label} className="container-page">
      <ul>
        {items.map((n) => (
          <li key={n.href}>
            <Link href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>{n.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
