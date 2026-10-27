'use client';

import type { MeView } from '@hedax/contracts';
import { Link } from '@/i18n/navigation';
import { Async } from '@/components/ui/async';
import { PageHeader } from '@/components/ui/misc';
import { useApi } from '@/lib/use-api';
import { useL } from './shell';

const destinations = [
  { href: '/admin/products', fa: 'قطعات', en: 'Parts', permission: 'products.read' },
  { href: '/admin/imports', fa: 'ورود اکسل قیمت و موجودی', en: 'Price & stock spreadsheet', permission: 'imports.run' },
  { href: '/admin/brand-imports', fa: 'ورود فهرست قطعات سازنده', en: 'Manufacturer parts list', permission: 'imports.run' },
  { href: '/admin/product-photos', fa: 'عکس‌های قطعات', en: 'Part photos', permission: 'products.write' },
  { href: '/admin/knowledge-catalog', fa: 'منابع و کاتالوگ‌ها', en: 'Reference catalogs', permission: 'imports.run' },
  { href: '/admin/inventory', fa: 'موجودی انبار', en: 'Stock', permission: 'inventory.read' },
  { href: '/admin/vehicles', fa: 'خودرو و تیپ', en: 'Vehicles & trims', permission: 'vehicles.manage' },
  { href: '/admin/taxonomy', fa: 'دسته‌ها و برندها', en: 'Categories & brands', permission: 'products.read' },
  { href: '/admin/units', fa: 'واحد فروش', en: 'Sales units', permission: 'products.read' },
] as const;

export function isCatalogPath(pathname: string) {
  return pathname === '/admin/catalog' || destinations.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
}

/** One workspace for existing workflows. Links never grant permission to their API actions. */
export function CatalogWorkspace({ user, pathname }: { user: MeView; pathname: string }) {
  const l = useL();
  const allowed = destinations.filter((d) => user.isOwner || user.permissions.includes(d.permission));
  return <section className="mb-6 rounded-[var(--radius-card)] border border-line-soft bg-white p-4" aria-label={l('مدیریت قطعات و منابع', 'Parts & sources workspace')}>
    <Link href="/admin/catalog" className="inline-flex min-h-11 items-center font-bold text-action underline underline-offset-4">{l('قطعات و منابع', 'Parts & sources')}</Link>
    <nav className="mt-3 flex flex-wrap gap-2" aria-label={l('بخش‌های قطعات و منابع', 'Parts & sources sections')}>
      {allowed.filter(d => ['/admin/products', '/admin/imports', '/admin/knowledge-catalog'].includes(d.href)).map((d) => {
        const active = pathname === d.href || pathname.startsWith(`${d.href}/`);
        return <Link key={d.href} href={d.href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 text-sm font-semibold ${active ? 'border-action bg-action text-white' : 'border-line-soft hover:bg-surface'}`}>{l(d.fa, d.en)}</Link>;
      })}
    </nav>
    <details className="mt-3" open={['/admin/vehicles', '/admin/taxonomy', '/admin/units', '/admin/inventory', '/admin/product-photos', '/admin/brand-imports'].some(p => pathname.startsWith(p)) || undefined}>
      <summary className="cursor-pointer py-2 text-sm font-semibold">{l('اطلاعات پایه، انبار و ابزارهای بیشتر', 'Setup, stock & more tools')}</summary>
      <div className="mt-1 flex flex-wrap gap-2">{allowed.filter(d => !['/admin/products', '/admin/imports', '/admin/knowledge-catalog'].includes(d.href)).map(d => <Link key={d.href} href={d.href} aria-current={pathname.startsWith(d.href) ? 'page' : undefined} className="inline-flex min-h-11 items-center rounded-lg border border-line-soft px-3 text-sm hover:bg-surface">{l(d.fa, d.en)}</Link>)}</div>
    </details>
  </section>;
}

export function CatalogWorkspaceHome() {
  const l = useL();
  const me = useApi<MeView>('/me');
  const tasks = [
    { href: '/admin/products/new', permission: 'products.write', title: l('ثبت یک قطعه', 'Add one part'), text: l('شماره فنی، نام، دسته، سازنده، کاربرد خودرو و عکس را وارد کنید. قیمت و موجودی را می‌توانید بعداً تکمیل کنید.', 'Enter part number, name, category, maker, vehicle fitment and photos. Price and stock can be added later.') },
    { href: '/admin/imports', permission: 'imports.run', title: l('ورود فایل اکسل', 'Import a spreadsheet'), text: l('برای فایل کالا، قیمت یا موجودی: نمونه را بگیرید، ستون‌ها را مشخص کنید و قبل از ثبت، خطاها و تغییرات را ببینید.', 'For parts, prices or stock: download a template, match the columns and review errors and changes before applying.') },
    { href: '/admin/knowledge-catalog', permission: 'imports.run', title: l('نگهداری کاتالوگ مرجع', 'Keep a reference catalog'), text: l('PDF، عکس، Excel و CSV مرجع را بایگانی کنید. ردیف‌های Excel و CSV قابل بررسی و تبدیل به فرم قطعه‌اند؛ فایل مرجع خودبه‌خود محصول نمی‌شود.', 'Archive reference PDFs, photos, Excel and CSV files. Excel/CSV rows can fill a part form for review; uploading a reference never creates products automatically.') },
    { href: '/admin/brand-imports', permission: 'imports.run', title: l('فهرست کامل سازنده', 'Manufacturer database'), text: l('برای فهرست بزرگ قطعات یک سازنده، بدون الزام قیمت؛ با تطبیق ستون‌ها، بررسی تکراری‌ها و پیش‌نمایش.', 'For a large maker’s parts list without required prices, with column mapping, duplicate review and preview.') },
  ];
  return <><PageHeader title={l('مدیریت قطعات و منابع', 'Manage parts & sources')} description={l('از کاری که می‌خواهید انجام دهید شروع کنید. تنظیم خودروها، برندها، واحدها و انبار همگی از همین بخش در دسترس‌اند.', 'Start with your task. Vehicles, brands, units and inventory are available in this workspace.')} /><Async state={me}>{user => <div className="grid gap-4 md:grid-cols-2">{tasks.filter(t => user.isOwner || user.permissions.includes(t.permission)).map(task => <Link key={task.href} href={task.href} className="rounded-[var(--radius-card)] border border-line-soft bg-white p-5 transition-colors hover:border-action focus-visible:outline-2 focus-visible:outline-action"><h2 className="font-bold text-action">{task.title}</h2><p className="mt-2 text-sm leading-7 text-steel">{task.text}</p></Link>)}</div>}</Async>
    <div className="mt-6 rounded-[var(--radius-card)] border border-line-soft bg-white p-5"><h2 className="font-bold">{l('اطلاعات خودرو را چگونه وارد کنیم؟', 'What vehicle information should staff enter?')}</h2><p className="mt-2 text-sm leading-8 text-steel">{l('برند خودرو مثل «پژو» با سازندهٔ قطعه مثل «بوش» فرق دارد. خودرو مثل «۲۰۶»، تیپ/مدل مثل «تیپ ۵» و بازهٔ سال، هرکدام جدا هستند. کد موتور، گیربکس، سمت چپ/راست و جلو/عقب را در مشخصات قطعه بنویسید. سازگاری و سال را فقط از منبع معتبر وارد کنید؛ خالی‌بودن بهتر از حدس‌زدن است.', 'A vehicle make such as Peugeot differs from a part maker such as Bosch. Vehicle (206), trim (Type 5) and years are separate. Record engine code, transmission and left/right or front/rear position in part specifications. Enter fitment and years only from a verified source; leave unknown values blank.')}</p></div></>;
}
