import { Link } from '@/i18n/navigation';

const TONES = {
  brand: 'bg-action text-white [&_a]:text-white',
  info: 'bg-action-soft text-ink [&_a]:text-action',
  warning: 'bg-[#FEF3C7] text-[#713F12] [&_a]:text-[#713F12]',
} as const;

/** The notice bar above every page (site content → notice bar); also the panel's preview. */
export function AnnouncementBarView({ text, linkLabel, href, tone }: { text: string; linkLabel: string; href: string; tone: keyof typeof TONES }) {
  const internal = href.startsWith('/');
  const link = href && linkLabel
    ? internal
      ? <Link href={href} className="font-semibold underline underline-offset-4">{linkLabel}</Link>
      : <a href={href} className="font-semibold underline underline-offset-4" {...(/^https?:/i.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{linkLabel}</a>
    : null;
  return (
    <div role="region" aria-label={text} className={`text-sm ${TONES[tone]}`}>
      <p className="container-page flex min-h-10 flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center leading-6">
        <span>{text}</span>
        {link}
      </p>
    </div>
  );
}
