'use client';

import type { MeView } from '@hedax/contracts';
import { ShoppingCart, UserRound, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { useCartCount } from '@/lib/cart-count';
import { cartBadgeText } from '@/lib/cart-units';

export function useMe(): { me: MeView | null; loading: boolean } {
  const [state, setState] = useState<{ me: MeView | null; loading: boolean }>({ me: null, loading: true });
  useEffect(() => {
    let alive = true;
    api<MeView>('/me')
      .then((me) => alive && setState({ me, loading: false }))
      .catch(() => alive && setState({ me: null, loading: false }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

const control = 'inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-sm font-semibold transition-colors hover:bg-white/10';

export function AccountLink() {
  const t = useTranslations('nav');
  const { me } = useMe();
  const href = me?.kind === 'STAFF' ? '/admin' : me ? '/account' : '/login';
  const label = me?.kind === 'STAFF' ? t('admin') : me ? t('account') : t('login');
  return (
    <details className="atelier-account">
      <summary aria-label={label}><UserRound aria-hidden className="size-5" /><span className="atelier-account-label">{label}</span></summary>
      <div className="atelier-account-menu">
        <Link href={me?.kind === 'CUSTOMER' ? '/account' : '/login'}><UserRound aria-hidden className="size-4" />{t('customerEntry')}</Link>
        <Link href={me?.kind === 'STAFF' ? href : '/staff/login'}><ShieldCheck aria-hidden className="size-4" />{t('staffEntry')}</Link>
      </div>
    </details>
  );
}

export function CartLink() {
  const t = useTranslations('nav');
  const locale = useLocale() as 'fa' | 'en';
  const { count } = useCartCount();
  // Changes are announced once the first total is known; the first answer itself is not news.
  const previous = useRef(count);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (previous.current !== null && count !== null && previous.current !== count) setAnnouncement(t('cartChanged', { count }));
    previous.current = count;
  }, [count, t]);
  return (
    <>
      <Link href="/cart" className={`relative min-w-11 justify-center ${control}`}>
        <ShoppingCart aria-hidden className="size-5" />
        <span className="sr-only">{count === null ? t('cart') : t('cartCount', { count })}</span>
        {/* Fixed colours, not theme tokens: the storefront remaps "signal" to its dark ink, which hid dark digits on a dark circle. */}
        {count ? (
          <span aria-hidden data-cart-badge className="absolute -end-0.5 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-[#2a1c16] px-1 text-xs font-bold leading-none text-[#fbf8f3] ring-2 ring-[#f5f0e8]">
            {cartBadgeText(count, locale)}
          </span>
        ) : null}
      </Link>
      <span role="status" className="sr-only">{announcement}</span>
    </>
  );
}
