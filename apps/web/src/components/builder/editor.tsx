'use client';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { Copy, Eye, EyeOff, GripVertical, Monitor, Redo2, Smartphone, Tablet, Trash2, Undo2 } from 'lucide-react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- admin-only validation; this module is never imported by storefront routes
import { BUILDER_KINDS, builderDocumentSchema, newBuilderBlock, type BuilderBlock, type BuilderDocument, type BuilderMedia, type BuilderRevision, type BuilderState, type MeView } from '@hedax/contracts';
import { api } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { BuilderView } from './view';
import { PreviewFrame } from './preview-frame';
import { SiteHeaderView } from '@/components/layout/site-header-view';
import { HomeHeaderView } from '@/components/layout/home-header-view';
import { DEFAULT_BUILDER_LOGO } from '@hedax/contracts/constants';
import { SiteFooterView } from '@/components/layout/site-footer-view';
import { loadBuilderData, type BuilderData } from './data';
import { BlockSettings, ThemeSettings, type Device } from './settings';
import { MediaLibrary } from './media-library';
import { blockLabels } from './labels';
import { ImageField, LocalizedField, LinkField } from '@/components/admin/content/kit';

const tabs = ['صفحه‌ساز بصری', 'مدیریت صفحه اصلی', 'تصاویر و رسانه‌ها', 'بنرها و اسلایدرها', 'سکشن‌ها و باکس‌ها', 'قالب‌ها و استایل‌ها', 'هدر و فوتر', 'موبایل و دسکتاپ', 'مدیریت صفحات', 'پیش‌نمایش و انتشار', 'تاریخچه و بازیابی'];
function Layer({ block, selected, select, duplicate, remove, toggle, move, index, total }: { block: BuilderBlock; selected: boolean; select: () => void; duplicate: () => void; remove: () => void; toggle: () => void; move: (offset: number) => void; index: number; total: number }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  return <li ref={setNodeRef} className="builder-layer" data-selected={selected} style={{ transform: CSS.Transform.toString(transform), transition }}>
    <div className="flex items-center"><button type="button" {...attributes} {...listeners} aria-label={`جابه‌جایی ${block.title.fa || blockLabels[block.kind]}`} className="min-h-11 min-w-8 touch-none"><GripVertical size={18} /></button><button type="button" className="min-h-11 min-w-0 flex-1 text-start text-sm font-bold" onClick={select}>{block.title.fa || blockLabels[block.kind]}</button></div>
    <div className="flex flex-wrap items-center gap-1"><button type="button" className="min-h-11 min-w-8" aria-label="نمایش یا مخفی کردن" onClick={toggle}>{block.visible ? <Eye size={16} /> : <EyeOff size={16} />}</button><button type="button" className="min-h-11 min-w-8" aria-label="کپی بخش" onClick={duplicate}><Copy size={16} /></button><button type="button" className="min-h-11 min-w-8" aria-label="حذف بخش" onClick={remove}><Trash2 size={16} /></button><button type="button" disabled={!index} className="min-h-11 px-1 text-xs disabled:opacity-30" onClick={() => move(-1)}>بالا</button><button type="button" disabled={index === total - 1} className="min-h-11 px-1 text-xs disabled:opacity-30" onClick={() => move(1)}>پایین</button></div>
  </li>;
}
const NO_LOGOS: Record<string, string> = {};
export function VisualBuilder({ slug = 'home', fullPreview = false, logos = NO_LOGOS }: { slug?: string; fullPreview?: boolean; logos?: Record<string, string> }) {
  const locale = useLocale();
  const [doc, setDoc] = useState<BuilderDocument | null>(null);
  const [data, setData] = useState<BuilderData | null>(null);
  const [selected, setSelected] = useState('');
  const [device, setDevice] = useState<Device>('desktop');
  const [tab, setTab] = useState(0);
  const [kind, setKind] = useState<BuilderBlock['kind']>('hero');
  const [status, setStatus] = useState('در حال دریافت صفحه…');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [history, setHistory] = useState<BuilderRevision[]>([]);
  const [me, setMe] = useState<MeView | null>(null);
  const [pages, setPages] = useState<Array<{ slug: string; publishedAt: string | null }>>([]);
  const [newPage, setNewPage] = useState('');
  const [mediaTarget, setMediaTarget] = useState<{ id: string; mobile: boolean; kind?: 'image' | 'video'; apply?: (media: BuilderMedia) => void } | null>(null);
  const [past, setPast] = useState<BuilderDocument[]>([]);
  const [future, setFuture] = useState<BuilderDocument[]>([]);
  const current = useRef<BuilderDocument | null>(null);
  const version = useRef(0);
  const saved = useRef('');
  const saving = useRef<Promise<void> | null>(null);
  const preventSave = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const endpoint = `/admin/content/builder/${slug}`;
  const reload = useCallback(async () => {
    const state = await api<BuilderState>(endpoint);
    version.current = state.version; current.current = state.document; saved.current = JSON.stringify(state.document);
    preventSave.current = false; setConflict(false); setDoc(state.document); setPast([]); setFuture([]);
    setSelected(state.document.sections[0]?.id ?? '');
    setStatus(state.publishedAt ? `آخرین انتشار: ${new Date(state.publishedAt).toLocaleString('fa-IR')} — ${state.publishedBy ?? ''}` : 'پیش‌نویس؛ هنوز از این صفحه‌ساز منتشر نشده است.');
    setData(await loadBuilderData(state.document, api, 'IRR', logos));
  }, [endpoint, logos]);
  useEffect(() => { void reload().catch(() => setStatus('دریافت صفحه ناموفق بود. دسترسی حساب و اتصال را بررسی کنید.')); void api<MeView>('/me').then(setMe).catch(() => undefined); }, [reload]);
  const change = (next: BuilderDocument) => {
    if (locked) return;
    const previous = current.current;
    if (previous) setPast(p => [...p.slice(-49), previous]);
    setFuture([]); current.current = next; setDoc(next); setStatus('تغییرات در حال ویرایش؛ ذخیرهٔ خودکار پیش‌نویس…');
  };
  const changeBlock = (block: BuilderBlock) => { if (current.current) change({ ...current.current, sections: current.current.sections.map(b => b.id === block.id ? block : b) }); };
  const save = useCallback(async () => {
    while (saving.current) await saving.current;
    const snapshot = current.current;
    if (!snapshot || preventSave.current || (version.current > 0 && JSON.stringify(snapshot) === saved.current)) return;
    const parsed = builderDocumentSchema.safeParse(snapshot);
    if (!parsed.success) { setStatus(`پیش‌نویس ذخیره نشد؛ مقدار نامعتبر در ${parsed.error.issues.map(i => i.path.join('.')).slice(0, 4).join('، ')}. فیلدها را اصلاح کنید.`); throw new Error('INVALID_DRAFT'); }
    setBusy(true);
    const task = (async () => {
      try {
        const result = await api<{ version: number }>(endpoint, { method: 'PUT', body: { version: version.current, document: parsed.data } });
        version.current = result.version; saved.current = JSON.stringify(snapshot); setStatus('پیش‌نویس ذخیره شد؛ بازدیدکنندگان هنوز نسخهٔ منتشرشده را می‌بینند.');
      } catch (e) {
        if (isApiError(e) && e.code === 'VERSION_CONFLICT') { preventSave.current = true; setConflict(true); setStatus('مدیر دیگری صفحه را تغییر داده است. نسخهٔ شما بازنویسی نشد؛ برای ادامه، آخرین نسخه را دریافت کنید.'); }
        else setStatus('ذخیره انجام نشد؛ اتصال، دسترسی یا مقادیر فرم را بررسی کنید.');
        throw e;
      } finally { setBusy(false); }
    })();
    saving.current = task;
    try { await task; } finally { if (saving.current === task) saving.current = null; }
  }, [endpoint]);
  useEffect(() => { if (fullPreview || !doc || conflict) return; const timer = setTimeout(() => void save().catch(() => undefined), 1200); return () => clearTimeout(timer); }, [doc, save, conflict, fullPreview]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (JSON.stringify(current.current) !== saved.current) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, []);
  const queryKey = JSON.stringify(doc?.sections.map(b => ({ id: b.id, kind: b.kind, query: b.query })));
  useEffect(() => { if (!current.current) return; let active = true; const timer = setTimeout(() => { void loadBuilderData(current.current, api, 'IRR', logos).then(next => { if (active) setData(next); }).catch(() => undefined); }, 700); return () => { active = false; clearTimeout(timer); }; }, [queryKey, logos]);
  useEffect(() => { if (tab === 10) void api<BuilderRevision[]>(`${endpoint}/history`).then(setHistory).catch(() => setStatus('دریافت تاریخچه ناموفق بود.')); if (tab === 8) void api<Array<{ slug: string; publishedAt: string | null }>>('/admin/content/builder').then(setPages).catch(() => undefined); }, [tab, endpoint]);
  const publish = async (revisionId?: string) => {
    setLocked(true);
    try {
      await save();
      if (preventSave.current || !current.current || saved.current !== JSON.stringify(current.current)) return;
      await api(`${endpoint}/${revisionId ? 'restore' : 'publish'}`, { method: 'POST', body: { version: version.current, ...(revisionId ? { revisionId } : {}) } });
      await reload(); setStatus(revisionId ? 'نسخهٔ انتخاب‌شده بازیابی و منتشر شد.' : 'تغییرات منتشر شد. صفحهٔ عمومی به‌روزرسانی شد.');
      if (tab === 10) setHistory(await api<BuilderRevision[]>(`${endpoint}/history`));
    } catch (e) { setStatus(isApiError(e) && e.code === 'VERSION_CONFLICT' ? 'نسخه تغییر کرده است؛ آخرین نسخه را دریافت کنید.' : isApiError(e) && e.code === 'MEDIA_NOT_CLEARED' ? 'انتشار متوقف شد: فیلم یا تصویر بنر اصلی «تأیید انتشار عمومی» ندارد (فایل بدون واترمارک از کتابخانه لازم است). پیش‌نویس و نسخهٔ عمومی محفوظ هستند.' : 'انتشار انجام نشد؛ پیش‌نویس و نسخهٔ عمومی محفوظ هستند.'); }
    finally { setLocked(false); }
  };
  const undo = () => { const prev = past.at(-1); const present = current.current; if (!prev || !present) return; setFuture(f => [present, ...f]); setPast(p => p.slice(0, -1)); current.current = prev; setDoc(prev); };
  const redo = () => { const next = future[0]; const present = current.current; if (!next || !present) return; setPast(p => [...p, present]); setFuture(f => f.slice(1)); current.current = next; setDoc(next); };
  const move = (from: number, to: number) => { if (doc) change({ ...doc, sections: arrayMove(doc.sections, from, to) }); };
  const drop = ({ active, over }: DragEndEvent) => { if (doc && over && active.id !== over.id) move(doc.sections.findIndex(b => b.id === active.id), doc.sections.findIndex(b => b.id === over.id)); };
  const chooseMedia = (media: BuilderMedia) => {
    if (mediaTarget?.apply) { mediaTarget.apply(media); setMediaTarget(null); setTab(0); return; }
    const target = doc?.sections.find(b => b.id === mediaTarget?.id);
    if (!target) return;
    const patch: BuilderBlock = { ...target, ...(mediaTarget?.mobile ? { mobileImageUrl: media.url } : { imageUrl: media.url }), alt: media.alt };
    if (!mediaTarget?.mobile && patch.legacy && 'imageUrl' in patch.legacy) patch.legacy = { ...patch.legacy, imageUrl: media.url };
    changeBlock(patch); setMediaTarget(null); setTab(0);
  };
  if (!doc || !data) return <p role="status">{status}</p>;
  const block = doc.sections.find(b => b.id === selected);
  const canPublish = me?.kind === 'STAFF' && (me.isOwner || me.permissions.includes('content.publish'));
  // The home page previews its own header (minimal centred logo) unless Appearance chooses the classic bar
  // or the page has no part search (then the classic bar keeps the search box, as on the site).
  const header = slug === 'home' && doc.chrome.homeHeader !== 'classic' && doc.sections.some(b => b.kind === 'vehicle-finder' && b.visible)
    ? <HomeHeaderView content={data.content} chrome={doc.chrome} currency="IRR" searchHref="#part-search" />
    : <SiteHeaderView content={data.content} chrome={doc.chrome} currency="IRR" />;
  const logo = doc.chrome.logo ?? DEFAULT_BUILDER_LOGO;
  const setLogo = (patch: Partial<typeof logo>) => change({ ...doc, chrome: { ...doc.chrome, logo: { ...logo, ...patch } } });
  const footer = <SiteFooterView content={data.content} chrome={doc.chrome} now={data.now} />;
  if (fullPreview) return <><p className="mb-4 rounded-xl bg-blue-50 p-4">پیش‌نمایش خصوصی — این پیش‌نویس برای بازدیدکنندگان نمایش داده نمی‌شود.</p>{header}<BuilderView document={doc} data={data} locale={locale} />{footer}</>;
  return <div className="builder-editor" dir="rtl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-steel">SOURCE BY HEDAX</p><h1 className="text-2xl font-bold">مدیریت ظاهر سایت</h1><p className="mt-1 text-sm text-steel">{doc.title.fa} — بخش را انتخاب کنید، تغییر دهید و سپس منتشر کنید.</p></div><Link href={slug === 'home' ? '/' : ['about', 'contact'].includes(slug) ? `/${slug}` : `/pages/${slug}`} target="_blank" className="text-action underline">مشاهده صفحه عمومی</Link></div>
    <div className="builder-toolbar">
      <Button size="sm" loading={busy} disabled={locked || conflict} onClick={() => void save().catch(() => undefined)}>ذخیره پیش‌نویس</Button>
      <Button size="sm" variant="ghost" aria-label="بازگشت" disabled={!past.length || locked} onClick={undo}><Undo2 size={18} />بازگشت</Button>
      <Button size="sm" variant="ghost" aria-label="انجام مجدد" disabled={!future.length || locked} onClick={redo}><Redo2 size={18} />انجام مجدد</Button>
      {([['mobile', Smartphone, 'موبایل'], ['tablet', Tablet, 'تبلت'], ['desktop', Monitor, 'دسکتاپ']] as const).map(([key, Icon, label]) => <Button key={key} size="sm" variant={device === key ? 'secondary' : 'ghost'} aria-pressed={device === key} onClick={() => setDevice(key)}><Icon size={18} />{label}</Button>)}
      <Button size="sm" variant="secondary" disabled={busy || locked || conflict} onClick={() => void save().then(() => { window.open(`/${locale}/admin/appearance/${slug}/preview`, '_blank', 'noopener,noreferrer'); }).catch(() => undefined)}>پیش‌نمایش کامل</Button>
      <Button size="sm" disabled={!canPublish || locked || conflict} loading={locked} onClick={() => void publish()}>انتشار تغییرات</Button>
    </div>
    <p role="status" className={`my-3 rounded-xl p-3 text-sm ${conflict ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-900'}`}>{status}</p>
    {conflict ? <Button onClick={() => void reload()}>دریافت آخرین نسخهٔ ذخیره‌شده</Button> : null}
    <div className="builder-tabs" role="tablist" aria-label="بخش‌های مدیریت ظاهر">{tabs.map((title, i) => <button key={title} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)}>{title}</button>)}</div>
    <fieldset disabled={locked} className="min-w-0">
    {tab === 2 ? <MediaLibrary canPublish={canPublish} {...(mediaTarget ? { onSelect: chooseMedia, kind: mediaTarget.kind ?? 'image' } : {})} /> : tab === 5 ? <ThemeSettings document={doc} change={change} /> : tab === 6 ? <div className="builder-panel !static !max-h-none">
      <h2 className="text-xl font-bold">هدر و فوتر</h2><p className="my-3 text-sm">لوگو، اطلاعات تماس، شبکه‌های اجتماعی و متن فوتر در تنظیمات محتوای فعلی قابل ویرایش‌اند.</p>
      <div className="flex flex-wrap gap-4"><Link className="text-action underline" href="/admin/content/general">لوگو و هویت برند</Link><Link className="text-action underline" href="/admin/content/contact">اطلاعات تماس</Link><Link className="text-action underline" href="/admin/content/social">شبکه‌های اجتماعی</Link><Link className="text-action underline" href="/admin/content/announcement">نوار اطلاع‌رسانی</Link></div>
      <h3 className="mt-6 font-bold">لوگوی سورس در هدر</h3>
      <p className="text-xs">خالی = لوگوی سایت از «لوگو و هویت برند». تغییرها در پیش‌نویس می‌مانند تا با «پیش‌نمایش کامل» دیده و سپس منتشر شوند.</p>
      <label>هدر صفحهٔ اصلی<select value={doc.chrome.homeHeader ?? 'minimal'} onChange={e => change({ ...doc, chrome: { ...doc.chrome, homeHeader: e.target.value as 'minimal' | 'classic' } })}><option value="minimal">مینیمال با لوگوی بزرگ (جست‌وجو در بخش «انتخاب خودرو»؛ بدون آن بخش، هدر کلاسیک می‌ماند)</option><option value="classic">کلاسیک با نوار جست‌وجو</option></select></label>
      <ImageField id="chrome-logo-header" purpose="logo" dark label="لوگوی هدر (روی زمینهٔ تیره)" value={logo.headerUrl} onChange={headerUrl => setLogo({ headerUrl })} hint="PNG یا SVG با زمینهٔ شفاف؛ نسبت افقی حدود ۳ به ۱ بهترین نتیجه را دارد." />
      <ImageField id="chrome-logo-mobile" purpose="logo" dark label="لوگوی موبایل (خالی = همان لوگوی هدر)" value={logo.mobileUrl} onChange={mobileUrl => setLogo({ mobileUrl })} />
      <ImageField id="chrome-logo-light" purpose="logo" label="لوگو برای زمینهٔ روشن" value={logo.onLightUrl} onChange={onLightUrl => setLogo({ onLightUrl })} hint="نسخهٔ تیرهٔ لوگو. فعلاً هدر و فوتر سایت تیره‌اند و این نسخه فقط ذخیره می‌شود تا در زمینه‌های روشن بعدی استفاده شود." />
      <label>اندازهٔ لوگو<select value={logo.size} onChange={e => setLogo({ size: e.target.value as typeof logo.size })}><option value="md">متوسط</option><option value="lg">بزرگ</option><option value="xl">خیلی بزرگ</option></select></label>
      <label>تراز لوگو<select value={logo.align} onChange={e => setLogo({ align: e.target.value as typeof logo.align })}><option value="center">وسط</option><option value="start">ابتدای هدر</option></select></label>
      <p className="text-xs">در موبایل اندازهٔ لوگو خودکار محدود می‌شود تا منو، سبد خرید و جست‌وجو جا داشته باشند.</p>
      {(['headerBackground', 'footerBackground'] as const).map(key => <label key={key}>{key === 'headerBackground' ? 'رنگ هدر' : 'رنگ فوتر'}<input type="color" value={doc.chrome[key]} onChange={e => change({ ...doc, chrome: { ...doc.chrome, [key]: e.target.value } })} /></label>)}
      <label>عرض لوگو در هدر کلاسیک و صفحه‌های دیگر<input type="number" min="70" max="280" value={doc.chrome.logoWidth} onChange={e => change({ ...doc, chrome: { ...doc.chrome, logoWidth: Math.max(70, Math.min(280, Number(e.target.value))) } })} /></label>
      <label>جایگاه لوگو<select value={doc.chrome.logoPosition} onChange={e => change({ ...doc, chrome: { ...doc.chrome, logoPosition: e.target.value as 'start' | 'end' } })}><option value="start">ابتدای هدر</option><option value="end">انتهای هدر</option></select></label>
      <label>ستون‌های فوتر<input type="number" min="1" max="4" value={doc.chrome.footerColumns} onChange={e => change({ ...doc, chrome: { ...doc.chrome, footerColumns: Math.max(1, Math.min(4, Number(e.target.value))) } })} /></label>
      <label><input type="checkbox" checked={doc.chrome.searchRounded} onChange={e => change({ ...doc, chrome: { ...doc.chrome, searchRounded: e.target.checked } })} />جستجوی گوشه‌گرد</label>
      <h3 className="mt-6 font-bold">منوی اصلی</h3><p className="text-xs">اگر فهرست خالی باشد، منوی فعلی سایت حفظ می‌شود.</p>
      {doc.chrome.menu.map((item, i) => <div key={i} className="my-4 rounded-xl border p-3"><LocalizedField id={`nav-${i}`} path="label" label="عنوان منو" maxLength={60} value={item.label} onChange={label => change({ ...doc, chrome: { ...doc.chrome, menu: doc.chrome.menu.map((x, j) => i === j ? { ...x, label } : x) } })} errors={{}} /><LinkField id={`nav-${i}-href`} label="لینک" value={item.href} onChange={href => change({ ...doc, chrome: { ...doc.chrome, menu: doc.chrome.menu.map((x, j) => i === j ? { ...x, href } : x) } })} /><Button size="sm" variant="ghost" disabled={!i} onClick={() => change({ ...doc, chrome: { ...doc.chrome, menu: arrayMove(doc.chrome.menu, i, i - 1) } })}>بالا</Button><Button size="sm" variant="ghost" onClick={() => change({ ...doc, chrome: { ...doc.chrome, menu: doc.chrome.menu.filter((_, j) => i !== j) } })}>حذف</Button></div>)}
      <Button disabled={doc.chrome.menu.length >= 12} onClick={() => change({ ...doc, chrome: { ...doc.chrome, menu: [...doc.chrome.menu, { label: { fa: 'منوی جدید', en: '' }, href: '/parts', visible: true }] } })}>افزودن منو</Button>
    </div> : tab === 8 ? <div className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">مدیریت صفحات</h2><p className="my-3">صفحات جدید در مسیر /pages/ منتشر می‌شوند و مسیرهای خرید و محصولات حفظ می‌شوند.</p><Link className="text-action underline" href="/admin/content/pages">صفحات متنی فعلی</Link><ul className="my-4 space-y-3">{pages.map(page => <li key={page.slug}><Link className="text-action underline" href={`/admin/appearance/${page.slug}`}>{page.slug}</Link> — {page.publishedAt ? 'منتشرشده' : 'پیش‌نویس'}</li>)}</ul><label className="block">نشانی صفحه (حروف انگلیسی و خط تیره)<input className="mx-3 rounded-lg border p-2" value={newPage} onChange={e => setNewPage(e.target.value)} dir="ltr" /></label>{/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newPage) && newPage.length >= 2 && newPage.length <= 60 ? <Link className="builder-button" href={`/admin/appearance/${newPage}`}>ساخت صفحه</Link> : null}</div> : tab === 10 ? <div className="rounded-2xl border bg-white p-5"><h2 className="mb-4 text-xl font-bold">تاریخچه و بازیابی</h2><p className="mb-4 text-sm">بازیابی، نسخهٔ انتخاب‌شده را فوراً منتشر می‌کند. نسخهٔ فعلی نیز در تاریخچه محفوظ می‌ماند.</p>{history.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><span>{new Date(row.createdAt).toLocaleString('fa-IR')} — {row.actorName} — {row.action === 'draft' ? 'پیش‌نویس قبلی' : row.action === 'previous-publication' ? 'انتشار قبلی' : row.action === 'rollback' ? 'بازیابی' : 'انتشار'}</span><Button size="sm" variant="secondary" disabled={!canPublish || locked} onClick={() => void publish(row.id)}>بازیابی این نسخه</Button></div>)}</div> : <>
      {tab === 9 ? <div className="mb-4 rounded-xl bg-white p-4"><p>این پیش‌نمایش از همان نمایش‌دهندهٔ صفحهٔ عمومی و داده‌های واقعی فروشگاه استفاده می‌کند. ذخیرهٔ پیش‌نویس عمومی نیست.</p><LocalizedField id="page-title" path="title" label="عنوان صفحه" maxLength={120} value={doc.title} onChange={title => change({ ...doc, title })} errors={{}} /><LocalizedField id="page-description" path="description" label="توضیح برای موتور جستجو" maxLength={170} value={doc.description} onChange={description => change({ ...doc, description })} errors={{}} /></div> : null}
      <div className="builder-workbench">
        <aside className="builder-panel"><h2 className="mb-3 font-bold">بخش‌ها و لایه‌ها</h2><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}><SortableContext items={doc.sections.map(b => b.id)} strategy={verticalListSortingStrategy}><ol>{doc.sections.map((b, i) => <Layer key={b.id} block={b} index={i} total={doc.sections.length} selected={selected === b.id} select={() => setSelected(b.id)} toggle={() => changeBlock({ ...b, visible: !b.visible })} remove={() => change({ ...doc, sections: doc.sections.filter(x => x.id !== b.id) })} duplicate={() => { if (doc.sections.length >= 40) return; const id = crypto.randomUUID(); change({ ...doc, sections: [...doc.sections.slice(0, i + 1), { ...structuredClone(b), id }, ...doc.sections.slice(i + 1)] }); setSelected(id); }} move={offset => move(i, i + offset)} />)}</ol></SortableContext></DndContext>
          <label>افزودن بخش<select value={kind} onChange={e => setKind(e.target.value as BuilderBlock['kind'])}>{BUILDER_KINDS.filter(k => k !== 'legacy').map(k => <option key={k} value={k}>{blockLabels[k]}</option>)}</select></label><Button className="w-full" size="sm" disabled={doc.sections.length >= 40} onClick={() => { const b = newBuilderBlock(kind, crypto.randomUUID()); b.title.fa = blockLabels[kind]; change({ ...doc, sections: [...doc.sections, b] }); setSelected(b.id); }}>افزودن بخش جدید</Button>
        </aside>
        <div className="builder-canvas"><PreviewFrame width={device === 'mobile' ? 390 : device === 'tablet' ? 768 : 1280} locale={locale}><div onClickCapture={e => { e.preventDefault(); e.stopPropagation(); setTab(6); }}>{header}</div><BuilderView document={doc} data={data} locale={locale} editing selectedId={selected} onSelect={setSelected} /><div onClickCapture={e => { e.preventDefault(); e.stopPropagation(); setTab(6); }}>{footer}</div></PreviewFrame></div>
        <aside className="builder-panel builder-panel-settings">{block ? <BlockSettings data={data} block={block} change={changeBlock} device={device} pick={(kind, apply) => { setMediaTarget({ id: block.id, mobile: false, kind, apply }); setTab(2); }} media={mobile => { setMediaTarget({ id: block.id, mobile }); setTab(2); }} /> : <p className="text-sm">بخشی را در پیش‌نمایش یا فهرست انتخاب کنید.</p>}</aside>
      </div>
    </>}
    </fieldset>
  </div>;
}
