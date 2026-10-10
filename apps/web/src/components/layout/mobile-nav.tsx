'use client';

import * as RDialog from '@radix-ui/react-dialog';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

/** Drawer navigation for small screens (focus trapped, Escape closes, focus returns). */
export function MobileNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const t = useTranslations('common');
  const tn = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [{ href: '/', label: tn('home') }, ...items, { href: '/about', label: tn('about') }, { href: '/contact', label: tn('contact') }];
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Trigger className="-ms-2 grid size-11 cursor-pointer place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-white/10 md:hidden" aria-label={t('openMenu')}>
        <Menu aria-hidden className="size-6" />
      </RDialog.Trigger>
      <RDialog.Portal>
        <RDialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-carbon/60" />
        <RDialog.Content
          className="on-dark drawer-start fixed inset-y-0 start-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-carbon text-silver shadow-[var(--shadow-overlay)]"
          dir={locale === 'fa' ? 'rtl' : 'ltr'}
        >
          <div className="flex h-16 items-center justify-between gap-3 border-b border-white/10 px-4">
            <span className="flex items-center gap-2.5">
              <Image src="/brand/source/icon-64.png" width={64} height={64} unoptimized alt="" className="size-8" />
              <RDialog.Title className="text-base font-bold text-white">{t('menu')}</RDialog.Title>
            </span>
            <RDialog.Close className="-me-2 grid size-11 cursor-pointer place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-white/10" aria-label={t('closeMenu')}>
              <X aria-hidden className="size-6" />
            </RDialog.Close>
          </div>
          <RDialog.Description className="sr-only">{t('menu')}</RDialog.Description>
          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <ul className="flex flex-col gap-0.5">
              {links.map((i) => {
                const active = isActive(i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-12 items-center rounded-[var(--radius-control)] border-s-2 px-3 font-medium transition-colors ${active ? 'border-tech-light bg-white/[0.06] text-white' : 'border-transparent hover:bg-white/[0.06]'}`}
                    >
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
