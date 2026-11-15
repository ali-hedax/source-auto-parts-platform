'use client';

import type { MeView } from '@hedax/contracts';
import { Link } from '@/i18n/navigation';
import { Async } from '@/components/ui/async';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

/** In the order staff work: the parts, the bulk ways in, stock, then the one-time setup lists. */
const destinations = [
  { href: '/admin/products', fa: 'قطعات', en: 'Parts', permission: 'products.read', main: true },
  { href: '/admin/imports', fa: 'ورود گروهی با اکسل', en: 'Spreadsheet import', permission: 'imports.run', main: true },
  { href: '/admin/product-photos', fa: 'عکس گروهی', en: 'Bulk photos', permission: 'products.write', main: true },
  { href: '/admin/inventory', fa: 'موجودی انبار', en: 'Stock', permission: 'inventory.read', main: true },
  { href: '/admin/taxonomy', fa: 'دسته‌ها و برندها', en: 'Categories & brands', permission: 'products.read', main: true },
  { href: '/admin/vehicles', fa: 'خودرو و تیپ', en: 'Vehicles & trims', permission: 'vehicles.manage', main: true },
  { href: '/admin/units', fa: 'واحد فروش', en: 'Sales units', permission: 'products.read', main: false },
  { href: '/admin/brand-imports', fa: 'فهرست قطعات سازنده', en: 'Manufacturer parts list', permission: 'imports.run', main: false },
  { href: '/admin/knowledge-catalog', fa: 'منابع و کاتالوگ‌ها', en: 'Reference catalogs', permission: 'imports.run', main: false },
] as const;

export function isCatalogPath(pathname: string) {
  return pathname === '/admin/catalog' || destinations.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
}

/** One workspace for existing workflows. Links never grant permission to their API actions. */
export function CatalogWorkspace({ user, pathname }: { user: MeView; pathname: string }) {
  const l = useL();
  const allowed = destinations.filter((d) => user.isOwner || user.permissions.includes(d.permission));
  const on = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const more = allowed.filter((d) => !d.main);
  return <section className="mb-6 rounded-[var(--radius-card)] border border-line-soft bg-white p-4" aria-label={l('مدیریت قطعات و منابع', 'Parts & sources workspace')}>
    <Link href="/admin/catalog" className="inline-flex min-h-11 items-center font-bold text-action underline underline-offset-4">{l('قطعات و منابع', 'Parts & sources')}</Link>
    <nav className="mt-3 flex flex-wrap gap-2" aria-label={l('بخش‌های قطعات و منابع', 'Parts & sources sections')}>
      {allowed.filter((d) => d.main).map((d) => <Link key={d.href} href={d.href} aria-current={on(d.href) ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 text-sm font-semibold ${on(d.href) ? 'border-action bg-action text-white' : 'border-line-soft hover:bg-surface'}`}>{l(d.fa, d.en)}</Link>)}
    </nav>
    {more.length ? <details className="mt-3" open={more.some((d) => on(d.href)) || undefined}>
      <summary className="cursor-pointer py-2 text-sm font-semibold">{l('ابزارهای کم‌کاربرد', 'Less-used tools')}</summary>
      <div className="mt-1 flex flex-wrap gap-2">{more.map((d) => <Link key={d.href} href={d.href} aria-current={on(d.href) ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm ${on(d.href) ? 'border-action bg-action font-semibold text-white' : 'border-line-soft hover:bg-surface'}`}>{l(d.fa, d.en)}</Link>)}</div>
    </details> : null}
  </section>;
}

export function CatalogWorkspaceHome() {
  const l = useL();
  const me = useApi<MeView>('/me');
  const steps = [
    { permission: 'products.read', title: l('۱. اطلاعات پایه (یک‌بار)', '1. Setup (once)'), text: l('دسته‌ها، سازنده‌های قطعه و خودروها را آماده کنید. هرکدام کم بود، هنگام ثبت قطعه هم از داخل همان فرم اضافه می‌شود.', 'Prepare categories, part makers and vehicles. Anything missing can also be added from inside the part form.'), links: [{ href: '/admin/taxonomy', label: l('دسته‌ها و برندها', 'Categories & brands') }, { href: '/admin/vehicles', label: l('خودرو و تیپ', 'Vehicles & trims') }] },
    { permission: 'products.write', title: l('۲. ثبت قطعه', '2. Add parts'), text: l('تک‌تک: نام، شمارهٔ فنی، دسته، خودرو، قیمت، موجودی و عکس در یک فرم. تعداد زیاد: فایل اکسل؛ قطعه‌های تازهٔ اکسل «پیش‌نویس» ثبت می‌شوند.', 'One by one: name, part number, category, vehicle, price, stock and photos in one form. Many at once: a spreadsheet; new parts from it are saved as drafts.'), links: [{ href: '/admin/products/new', label: l('ثبت یک قطعه', 'Add one part') }, { href: '/admin/imports', label: l('ورود گروهی با اکسل', 'Spreadsheet import') }] },
    { permission: 'products.write', title: l('۳. عکس', '3. Photos'), text: l('عکس هر قطعه در فرم خودش گذاشته می‌شود. برای تعداد زیاد، نام فایل عکس را شمارهٔ فنی یا کد کالا بگذارید و یک‌جا بارگذاری کنید.', 'Each part’s photos go in its own form. For many, name the files by part number or SKU and upload them together.'), links: [{ href: '/admin/product-photos', label: l('عکس گروهی', 'Bulk photos') }] },
    { permission: 'products.read', title: l('۴. بررسی و انتشار', '4. Review and publish'), text: l('در فهرست قطعات، وضعیت را روی «پیش‌نویس» بگذارید، قیمت، موجودی و عکس را نگاه کنید، قطعه‌ها را تیک بزنید و «انتشار انتخاب‌شده‌ها» را بزنید.', 'In the parts list, filter by “Drafts”, check price, stock and photos, tick the parts and press “Publish selected”.'), links: [{ href: '/admin/products', label: l('فهرست قطعات', 'Parts list') }, { href: '/admin/inventory', label: l('موجودی انبار', 'Stock') }] },
  ];
  return <><PageHeader title={l('مدیریت قطعات و منابع', 'Manage parts & sources')} description={l('مسیر کار از ثبت قطعه تا نمایش در سایت، به ترتیب:', 'The path from adding a part to showing it on the site, in order:')} /><Async state={me}>{user => <ol className="grid gap-4 md:grid-cols-2">{steps.filter(s => user.isOwner || user.permissions.includes(s.permission)).map(step => <li key={step.title} className="rounded-[var(--radius-card)] border border-line-soft bg-white p-5"><h2 className="font-bold">{step.title}</h2><p className="mt-2 text-sm leading-7 text-steel">{step.text}</p><p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{step.links.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center font-semibold text-action underline underline-offset-4">{link.label}</Link>)}</p></li>)}</ol>}</Async>
    <div className="mt-6 rounded-[var(--radius-card)] border border-line-soft bg-white p-5"><h2 className="font-bold">{l('برند خودرو، خودرو و سازندهٔ قطعه چه فرقی دارند؟', 'Vehicle make, vehicle and part maker: what is the difference?')}</h2><p className="mt-2 text-sm leading-8 text-steel">{l('برند خودرو مثل «پژو»، خودرو مثل «۲۰۶» و تیپ مثل «تیپ ۵» است؛ سازندهٔ قطعه شرکتی است که قطعه را ساخته، مثل «بوش». سازگاری و سال را فقط از منبع معتبر وارد کنید؛ خالی‌بودن بهتر از حدس‌زدن است.', 'A vehicle make is like Peugeot, a vehicle like 206 and a trim like Type 5; the part maker is the company that made the part, like Bosch. Enter fitment and years only from a verified source; leave unknown values blank.')}</p></div></>;
}
