import type { CategoryView } from '@hedax/contracts';
import { ArrowLeft, ArrowRight, Boxes, CarFront, PackageSearch } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/**
 * The three shopping paths («خودروی من»، «کاتالوگ قطعات»، «درخواست تأمین») with the top-level part
 * categories. Its own movable section in Appearance («مسیرهای خرید»); the film block shows the same
 * band beneath itself only while the page has no such section (older pages keep their layout).
 */
export function ShoppingPaths({ categories, locale, title }: { categories: CategoryView[]; locale: string; title?: string }) {
  const fa = locale === 'fa';
  const Arrow = fa ? ArrowLeft : ArrowRight;
  const name = (n: { fa: string; en: string | null }) => (fa ? n.fa : (n.en ?? n.fa));
  const digits = (n: number) => n.toLocaleString(fa ? 'fa-IR' : 'en-US');
  const paths = [
    { href: '/cars', icon: CarFront, title: fa ? 'خودروی من' : 'My vehicle', text: fa ? 'قطعه‌ای که به خودروی شما می‌خورد' : 'Parts that fit your vehicle' },
    { href: '/parts', icon: Boxes, title: fa ? 'کاتالوگ قطعات' : 'Parts catalogue', text: fa ? 'از شماره فنی تا قطعهٔ مورد نیازتان' : 'From a part number to the part you need' },
    { href: '/request-part', icon: PackageSearch, title: fa ? 'درخواست تأمین' : 'Request a part', text: fa ? 'قطعه‌تان را پیدا نکردید؟ به ما بسپارید' : 'Can’t find your part? Leave it with us' },
  ];
  const top = categories.filter((c) => !c.parentSlug).slice(0, 10);
  return <section className="cine-discover" aria-label={title || (fa ? 'مسیرهای خرید قطعه' : 'Find your way to the right part')}>
    <div className="cine-discover-inner">
      <ul className="cine-paths">
        {paths.map((p) => <li key={p.href}><Link href={p.href}>
          <span className="cine-path-icon"><p.icon aria-hidden size={28} strokeWidth={1.6} /></span>
          <span className="cine-path-text"><strong>{p.title}</strong><span>{p.text}</span></span>
          <Arrow aria-hidden size={18} className="cine-path-arrow" />
        </Link></li>)}
      </ul>
      {top.length ? <nav className="cine-categories" aria-label={fa ? 'دسته‌بندی قطعات' : 'Part categories'}>
        <ul>{top.map((c) => <li key={c.slug}><Link href={`/parts?category=${encodeURIComponent(c.slug)}`}>{name(c.name)}{c.productCount ? <span className="num">{digits(c.productCount)}</span> : null}</Link></li>)}</ul>
      </nav> : null}
    </div>
  </section>;
}
