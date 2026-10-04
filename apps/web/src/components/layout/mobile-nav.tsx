'use client';

import * as RDialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';

/** Drawer navigation for small screens (focus trapped, Escape closes, focus returns). */
export function MobileNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const t = useTranslations('common');
  const tn = useTranslations('nav');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const side = locale === 'fa' ? 'right-0' : 'left-0';
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Trigger className="grid size-11 cursor-pointer place-items-center rounded hover:bg-white/10 md:hidden" aria-label={t('openMenu')}>
        <Menu aria-hidden className="size-6" />
      </RDialog.Trigger>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-carbon/60" />
        <RDialog.Content className={`fixed inset-y-0 ${side} z-50 w-[min(20rem,85vw)] bg-carbon p-4 text-silver`} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
          <div className="mb-4 flex items-center justify-between">
            <RDialog.Title className="text-lg font-bold text-white">{t('menu')}</RDialog.Title>
            <RDialog.Close className="grid size-11 cursor-pointer place-items-center rounded hover:bg-white/10" aria-label={t('closeMenu')}>
              <X aria-hidden className="size-6" />
            </RDialog.Close>
          </div>
          <RDialog.Description className="sr-only">{t('menu')}</RDialog.Description>
          <nav>
            <ul className="flex flex-col gap-1">
              {[{ href: '/', label: tn('home') }, ...items, { href: '/about', label: tn('about') }, { href: '/contact', label: tn('contact') }].map((i) => (
                <li key={i.href}>
                  <Link href={i.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded px-3 hover:bg-white/10">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
