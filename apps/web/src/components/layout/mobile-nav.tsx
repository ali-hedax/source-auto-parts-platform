'use client';

import * as RDialog from '@radix-ui/react-dialog';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

/** Drawer navigation (focus trapped, Escape closes, focus returns): small screens, or every size on the
 *  minimal home header (`alwaysVisible`), where `extra` (e.g. the currency choice) sits under the links. */
export function MobileNav({ items, alwaysVisible = false, extra }: { items: Array<{ href: string; label: string }>; alwaysVisible?: boolean; extra?: ReactNode }) {
  const t = useTranslations('common');
  const tn = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = [{ href: '/', label: tn('home') }, ...items, { href: '/about', label: tn('about') }, { href: '/contact', label: tn('contact') }];
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Trigger className={`-ms-2 grid size-11 cursor-pointer place-items-center rounded-[var(--radius-control)] transition-colors hover:bg-white/10 ${alwaysVisible ? '' : 'md:hidden'}`} aria-label={t('openMenu')}>
        <Menu aria-hidden className="size-6" />
      </RDialog.Trigger>
      <RDialog.Portal>
        <RDialog.Overlay className="overlay-fade fixed inset-0 z-50 bg-stage/70" />
        <RDialog.Content
          className="on-dark drawer-start fixed inset-y-0 start-0 z-50 flex w-[min(20rem,85vw)] flex-col bg-stage text-silver shadow-[var(--shadow-overlay)]"
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
                      className={`flex min-h-12 items-center rounded-[var(--radius-control)] border-s-2 px-3 font-medium transition-colors ${active ? 'border-signal bg-white/[0.06] text-white' : 'border-transparent hover:bg-white/[0.06]'}`}
                    >
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {extra ? <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">{extra}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
