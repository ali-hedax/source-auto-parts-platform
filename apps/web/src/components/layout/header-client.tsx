'use client';

import type { CartView, MeView } from '@hedax/contracts';
import { toPersianDigits } from '@hedax/domain';
import { ShoppingCart, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/client';

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
    <Link href={href} className={control}>
      <UserRound aria-hidden className="size-5" />
      <span className="hidden lg:inline">{label}</span>
      <span className="sr-only lg:hidden">{label}</span>
    </Link>
  );
}

export function CartLink() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () =>
      api<CartView>('/cart')
        .then((c) => setCount(c.lines.reduce((s, l) => s + l.quantity, 0)))
        .catch(() => setCount(0));
    load();
    window.addEventListener('hedax:cart-changed', load);
    return () => window.removeEventListener('hedax:cart-changed', load);
  }, []);
  const shown = count > 99 ? '99+' : String(count);
  return (
    <Link href="/cart" className={`relative min-w-11 justify-center ${control}`}>
      <ShoppingCart aria-hidden className="size-5" />
      <span className="sr-only">{t('cartCount', { count })}</span>
      {count > 0 ? (
        <span aria-hidden className="absolute end-0.5 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-tech-light px-1 text-[0.6875rem] font-bold leading-none text-carbon ring-2 ring-carbon">
          {locale === 'fa' ? toPersianDigits(shown) : shown}
        </span>
      ) : null}
    </Link>
  );
}
