'use client';

import type { AdminProductRow, MeView, MoneyDto, PartDraftView, UnitRef, UnitView, VehicleOption } from '@hedax/contracts';
import { formatQuantity, isValidQuantity, minorToDecimalString, parseDecimalAmount, toAsciiDigits } from '@hedax/domain';
import { ImagePlus, Plus, X } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Money, Num, Quantity, useListSeparator } from '@/components/ui/format';
import { Alert, Badge, Code, EmptyState, PageHeader, Section, TableScroll, td, th } from '@/components/ui/misc';
import { Link, useRouter } from '@/i18n/navigation';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { typedNumber } from '@/lib/numbers';
import { useApi } from '@/lib/use-api';
import { PHOTO_EXTENSIONS, PHOTO_MAX_BYTES, PHOTO_TYPES, ProductPhotoManager } from './product-photos';
import { useL, usePriceSourceLabel } from './shell';
import { type FitmentValue, VehiclePicker } from './vehicle-picker';

interface Taxonomy {
  categories: Array<{ id: string; code: string; nameFa: string; nameEn: string | null; active?: boolean }>;
  vehicleBrands: Array<{ id: string; code: string; nameFa: string; nameEn: string | null; active?: boolean }>;
  manufacturers: Array<{ id: string; nameFa: string; nameEn: string | null; active?: boolean }>;
  customerGroups: Array<{ id: string; key: string; nameFa: string; nameEn: string }>;
  units: UnitView[];
}

/**
 * Prices are typed and shown in toman in the panel (as on the storefront) and stored in rial.
 * A stored rial amount that is not a multiple of ten keeps its last digit as one decimal.
 */
const rialToTomanText = (rial: bigint) => (rial % 10n === 0n ? (rial / 10n).toString() : `${rial / 10n}.${rial % 10n}`);
const tomanTextToRial = (text: string): bigint => {
  const m = /^(\d+)(?:\.(\d))?$/.exec(toAsciiDigits(text).replace(/[,٬\s]/g, '').replace(/٫/g, '.'));
  if (!m) throw new Error('INVALID_AMOUNT');
  return BigInt(m[1] ?? '0') * 10n + BigInt(m[2] ?? '0');
};
const has = (me: MeView | null, permission: string) => !!me && (me.isOwner || me.permissions.includes(permission));

/** A price as staff read it: rial amounts in toman, dirham as is. */
function PanelPrice({ value }: { value: MoneyDto }) {
  const locale = useLocale();
  if (value.currency !== 'IRR') return <Money value={value} />;
  const rial = BigInt(value.amountMinor);
  const figure = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US').format(rial / 10n);
  return <bdi className="whitespace-nowrap"><span className="num">{figure}</span> <span className="text-[0.8em] font-medium opacity-80">{locale === 'fa' ? 'تومان' : 'toman'}</span></bdi>;
}

/** Panel → «قطعات»: every part, with or without price; search by name, SKU or any technical number. */
export function ProductsList() {
  const t = useTranslations();
  const l = useL();
  const search = useSearchParams();
  const me = useApi<MeView>('/me');
  const canWrite = has(me.data, 'products.write');
  const canPublish = has(me.data, 'products.publish');
  const [q, setQ] = useState(search.get('q') ?? '');
  const [applied, setApplied] = useState(q);
  const [status, setStatus] = useState<'all' | 'draft' | 'published' | 'archived'>('all');
  const [page, setPage] = useState(1);
  // Drafts ticked for «انتشار انتخاب‌شده‌ها» (e.g. after a spreadsheet import, which creates drafts).
  const [picked, setPicked] = useState<string[]>([]);
  const [bulk, setBulk] = useState<{ busy: boolean; done?: number; needPhoto?: number; failed?: number }>({ busy: false });
  const filter = status === 'draft' ? '&published=0' : status === 'published' ? '&published=1' : status === 'archived' ? '&archived=1' : '';
  const state = useApi<{ items: AdminProductRow[]; total: number }>(`/admin/products?page=${page}&pageSize=50${applied ? `&q=${encodeURIComponent(applied)}` : ''}${filter}`);
  const goto = (next: number) => { setPage(next); setPicked([]); };
  const publishPicked = async (rows: AdminProductRow[]) => {
    setBulk({ busy: true });
    let done = 0; let needPhoto = 0; let failed = 0;
    for (const row of rows.filter((r) => picked.includes(r.id))) {
      try {
        await api(`/admin/products/${row.id}/publish`, { method: 'POST', body: { published: true, version: row.version } });
        done += 1;
      } catch (e) {
        if (isApiError(e) && e.code === 'REAL_PHOTO_REQUIRED') needPhoto += 1; else failed += 1;
      }
    }
    setPicked([]);
    setBulk({ busy: false, done, needPhoto, failed });
    await state.reload();
  };
  return (
    <>
      <PageHeader
        title={t('admin.products')}
        description={l('هر قطعه ابتدا «پیش‌نویس» است و تا منتشر نشود در سایت دیده نمی‌شود. قطعهٔ بدون قیمت در سایت با «درخواست تأمین» نشان داده می‌شود.', 'Every part starts as a draft and is not on the site until published. A part without a price is shown on the site with “Request this part”.')}
        actions={canWrite ? <ButtonLink href="/admin/products/new" icon={<Plus aria-hidden className="size-4" />}>{t('admin.newProduct')}</ButtonLink> : undefined}
      />
      <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); goto(1); }}>
        <Field id="ap-q" label={l('نام، کد کالا یا شمارهٔ فنی', 'Name, SKU or part number')} className="min-w-64 flex-1"><Input id="ap-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field id="ap-status" label={l('وضعیت', 'Status')}>
          <Select id="ap-status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); goto(1); }}>
            <option value="all">{l('همه', 'All')}</option>
            <option value="draft">{l('پیش‌نویس (منتشرنشده)', 'Drafts (unpublished)')}</option>
            <option value="published">{l('منتشرشده', 'Published')}</option>
            <option value="archived">{t('admin.archived')}</option>
          </Select>
        </Field>
        <Button type="submit" variant="secondary">{t('common.search')}</Button>
      </form>
      {bulk.done !== undefined ? (
        <Alert tone={bulk.needPhoto || bulk.failed ? 'warning' : 'success'} className="mb-4" title={l(`${bulk.done} قطعه منتشر شد.`, `${bulk.done} parts published.`)}>
          {bulk.needPhoto ? <p>{l(`${bulk.needPhoto} قطعهٔ کارکرده یا بازسازی‌شده عکس واقعی ندارد و منتشر نشد.`, `${bulk.needPhoto} used or refurbished parts have no real photo and were not published.`)}</p> : null}
          {bulk.failed ? <p>{l(`${bulk.failed} قطعه منتشر نشد (شاید هم‌زمان تغییر کرده باشد)؛ دوباره تلاش کنید.`, `${bulk.failed} parts were not published (they may have changed meanwhile); try again.`)}</p> : null}
        </Alert>
      ) : null}
      <Async state={state}>
        {(data) => {
          const drafts = data.items.filter((p) => !p.published && !p.archived);
          const allPicked = drafts.length > 0 && drafts.every((p) => picked.includes(p.id));
          return data.items.length ? (
            <>
              {canPublish && drafts.length ? (
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <Checkbox id="ap-pick-all" label={l('انتخاب همهٔ پیش‌نویس‌های این صفحه', 'Select all drafts on this page')} checked={allPicked} onChange={(e) => setPicked(e.target.checked ? drafts.map((p) => p.id) : [])} />
                  <Button disabled={!picked.length} loading={bulk.busy} onClick={() => void publishPicked(drafts)}>{l('انتشار انتخاب‌شده‌ها', 'Publish selected')}{picked.length ? <> (<Num value={picked.length} />)</> : null}</Button>
                </div>
              ) : null}
              <TableScroll caption={t('admin.products')}>
                <thead>
                  <tr>
                    {canPublish ? <th className={th}><span className="sr-only">{l('انتخاب', 'Select')}</span></th> : null}
                    <th className={th}>{t('admin.sku')}</th><th className={th}>{t('parts.partNumber')}</th><th className={th}>{t('admin.name')}</th><th className={th}>{t('parts.maker')}</th>
                    <th className={th}>{t('admin.price')}</th><th className={th}>{t('admin.available')}</th><th className={th}>{l('عکس', 'Photos')}</th><th className={th}>{l('وضعیت', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      {canPublish ? (
                        <td className={td}>
                          {!p.published && !p.archived ? <input type="checkbox" className="size-5 cursor-pointer" aria-label={l(`انتخاب ${p.nameFa}`, `Select ${p.nameEn ?? p.nameFa}`)} checked={picked.includes(p.id)} onChange={(e) => setPicked((v) => (e.target.checked ? [...v, p.id] : v.filter((x) => x !== p.id)))} /> : null}
                        </td>
                      ) : null}
                      <td className={td}><Link href={`/admin/products/${p.id}`} className="font-semibold text-action underline underline-offset-4 hover:text-action-hover"><Code>{p.sku}</Code></Link></td>
                      <td className={td}>{p.partNumber ? <Code>{p.partNumber}</Code> : '—'}</td>
                      <td className={td}><Link href={`/admin/products/${p.id}`} className="hover:underline">{p.nameFa}</Link>{p.nameEn ? <span className="block text-xs text-steel">{p.nameEn}</span> : null}</td>
                      <td className={td}>{p.manufacturer ?? '—'}</td>
                      <td className={td}>{p.basePrice ? <PanelPrice value={p.basePrice} /> : <Badge>{l('بدون قیمت (قابل تأمین)', 'No price (sourceable)')}</Badge>}</td>
                      <td className={td}>{p.available <= p.lowStockThreshold ? <Badge tone="warning"><Quantity value={p.available} unit={p.unit} /></Badge> : <Quantity value={p.available} unit={p.unit} />}</td>
                      <td className={td}><Num value={p.photoCount} /></td>
                      <td className={td}>{p.archived ? <Badge tone="danger">{t('admin.archived')}</Badge> : p.published ? <Badge tone="success">{l('منتشرشده', 'Published')}</Badge> : <Badge>{l('پیش‌نویس', 'Draft')}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </>
          ) : <EmptyState title={t('parts.empty')} />;
        }}
      </Async>
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={page === 1} onClick={() => goto(page - 1)}>{l('قبلی', 'Previous')}</Button><span>{l('صفحه', 'Page')} <Num value={page} /> · <Num value={state.data?.total ?? 0} /> {l('قطعه', 'parts')}</span><Button variant="secondary" disabled={!state.data || page * 50 >= state.data.total} onClick={() => goto(page + 1)}>{l('بعدی', 'Next')}</Button></div>
    </>
  );
}

interface SpecRow { key: string; labelFa: string; labelEn?: string; value: string }
interface YearRow { yearFrom: string; yearTo: string; note: string }

interface ProductForm {
  sku: string; slug: string; partNumber: string; equivalents: string; replacements: string; nameFa: string; nameEn: string; aliases: string; descriptionFa: string; descriptionEn: string;
  categoryId: string; manufacturerBrandId: string; vehicleBrandIds: string[]; vehicles: FitmentValue[]; years: Record<string, YearRow>; partType: string; condition: string; origin: string;
  countryOfManufacture: string; warrantyFa: string; warrantyEn: string; unitId: string; packQuantity: string; oemCodes: string; specs: SpecRow[];
  /** `basePrice` and `manualIrr` are typed in toman when the currency is IRR. */
  baseCurrency: 'IRR' | 'AED'; basePrice: string; manualIrr: string; manualAed: string; lowStockThreshold: string; isSellable: boolean;
  /** Physical count in the part's unit; saved through the stock ledger, not with the part. */
  stock: string;
}

interface AdminProduct {
  id: string; sku: string; slug: string; nameFa: string; nameEn: string | null; aliases: string[]; descriptionFa: string | null; descriptionEn: string | null;
  warrantyFa: string | null; warrantyEn: string | null; categoryId: string; manufacturerBrandId: string | null; vehicleBrandIds: string[];
  vehicles: Array<{ vehicleId: string; modelId: string | null; yearFrom: number | null; yearTo: number | null; note: string | null; vehicleName: string; modelName: string | null }>;
  partNumber: string | null; equivalents: string[]; replacements: string[]; specs: SpecRow[]; partType: string; condition: string; origin: string;
  countryOfManufacture: string | null; unitId: string; unit: UnitRef & { id: string; active: boolean }; packQuantity: number; oemCodes: string[]; published: boolean; archived: boolean; isSellable: boolean; version: number;
  basePrice: { currency: 'IRR' | 'AED'; amountMinor: string; manualIrr: string | null; manualAed: string | null } | null;
  priceExplanation: { source: string; unitPayableIrr: string | null; warnings: string[] };
  priceRules: Array<{ id: string; customerGroupId: string | null; minQty: number; maxQty: number | null; base: MoneyDto; manualIrr: string | null; active: boolean }>;
  inventory: { onHand: number; reserved: number; version: number; lowStockThreshold: number } | null;
  media: Array<{ id: string; storageKey: string; width: number; height: number; altFa: string; isPrimary: boolean }>;
}

const fitKey = (v: { vehicleId: string; modelId: string | null }) => `${v.vehicleId}:${v.modelId ?? ''}`;
const list = (text: string) => [...new Set(text.split(/[,،;؛\n]+/).map((s) => s.trim()).filter(Boolean))];
const year = (s: string) => (s.trim() ? typedNumber(s) : null);
/** Fields inside «اطلاعات تکمیلی»; an error on one of them opens that block. */
const isExtraField = (id: string) => /^pf-(sku|pack|country|threshold|manualaed|sl-\d+|sv-\d+)$/.test(id);

const toForm = (p: AdminProduct | undefined, units: UnitView[]): ProductForm => ({
  sku: p?.sku ?? '', slug: p?.slug ?? '', partNumber: p?.partNumber ?? '', equivalents: (p?.equivalents ?? []).join(', '), replacements: (p?.replacements ?? []).join(', '),
  nameFa: p?.nameFa ?? '', nameEn: p?.nameEn ?? '', aliases: (p?.aliases ?? []).join('، '),
  descriptionFa: p?.descriptionFa ?? '', descriptionEn: p?.descriptionEn ?? '', categoryId: p?.categoryId ?? '', manufacturerBrandId: p?.manufacturerBrandId ?? '',
  vehicleBrandIds: p?.vehicleBrandIds ?? [], vehicles: (p?.vehicles ?? []).map((v) => ({ vehicleId: v.vehicleId, modelId: v.modelId })),
  years: Object.fromEntries((p?.vehicles ?? []).map((v) => [fitKey(v), { yearFrom: v.yearFrom?.toString() ?? '', yearTo: v.yearTo?.toString() ?? '', note: v.note ?? '' }])),
  partType: p?.partType ?? 'GENUINE', condition: p?.condition ?? 'NEW', origin: p?.origin ?? 'DOMESTIC',
  countryOfManufacture: p?.countryOfManufacture ?? '', warrantyFa: p?.warrantyFa ?? '', warrantyEn: p?.warrantyEn ?? '',
  // New products start with «عدد» (the first active unit when it is missing); the field is required.
  unitId: p?.unitId ?? (units.find((u) => u.active && u.name === 'عدد') ?? units.find((u) => u.active))?.id ?? '',
  packQuantity: String(p?.packQuantity ?? 1), oemCodes: (p?.oemCodes ?? []).join(', '), specs: Array.isArray(p?.specs) ? p.specs : [],
  baseCurrency: p?.basePrice?.currency ?? 'IRR',
  basePrice: p?.basePrice ? (p.basePrice.currency === 'IRR' ? rialToTomanText(BigInt(p.basePrice.amountMinor)) : minorToDecimalString(BigInt(p.basePrice.amountMinor), 'AED')) : '',
  manualIrr: p?.basePrice?.manualIrr ? rialToTomanText(BigInt(p.basePrice.manualIrr)) : '', manualAed: p?.basePrice?.manualAed ? minorToDecimalString(BigInt(p.basePrice.manualAed), 'AED') : '',
  lowStockThreshold: String(p?.inventory?.lowStockThreshold ?? 0), isSellable: p?.isSellable ?? true,
  stock: p?.inventory ? String(p.inventory.onHand) : '',
});

export function ProductEditorPage() {
  const l = useL(); const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const search = useSearchParams();
  const product = useApi<AdminProduct>(isNew ? null : `/admin/products/${id}`);
  const taxonomy = useApi<Taxonomy>('/admin/taxonomy');
  const me = useApi<MeView>('/me');
  const readOnly = !has(me.data, 'products.write');
  const rights = { publish: has(me.data, 'products.publish'), stock: has(me.data, 'inventory.adjust') };
  // «تبدیل به قطعه» from the knowledge center: the form filled from an extracted row.
  const fromDocument = isNew ? search.get('fromDocument') : null;
  const ordinal = Number(search.get('ordinal') ?? 0);
  const validSource = !!fromDocument && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fromDocument) && Number.isInteger(ordinal) && ordinal >= 0;
  const draft = useApi<PartDraftView>(validSource ? `/admin/knowledge-catalog/${fromDocument}/candidates/${ordinal}/draft` : null);
  if (fromDocument && !validSource) return <Alert tone="danger" title={l('نشانی ردیف کاتالوگ معتبر نیست؛ از منابع و کاتالوگ‌ها دوباره ردیف را انتخاب کنید.', 'Invalid catalog row address; select the row again from Reference catalogs.')} />;
  if (fromDocument && draft.error) return <Alert tone="danger" title={errorText(t, draft.error)}><Link href="/admin/knowledge-catalog" className="text-action underline">{l('بازگشت به منابع و کاتالوگ‌ها', 'Back to Reference catalogs')}</Link></Alert>;
  return (
    <Async state={taxonomy}>
      {(tax) => isNew
        ? (fromDocument && !draft.data && !draft.error ? <p className="text-sm text-steel">…</p> : <ProductEditor readOnly={readOnly} rights={rights} taxonomy={tax} {...(draft.data ? { draft: draft.data } : {})} />)
        : <Async state={product}>{(p) => <ProductEditor readOnly={readOnly} rights={rights} taxonomy={tax} product={p} reload={product.reload} />}</Async>}
    </Async>
  );
}

type Named = { id: string; nameFa: string; nameEn: string | null; active?: boolean };

function ProductEditor({ taxonomy, product, reload, draft, readOnly, rights }: { taxonomy: Taxonomy; product?: AdminProduct; reload?: () => Promise<void>; draft?: PartDraftView; readOnly: boolean; rights: { publish: boolean; stock: boolean } }) {
  const t = useTranslations();
  const l = useL();
  const priceSource = usePriceSourceLabel();
  const router = useRouter();
  const search = useSearchParams();
  const [f, setF] = useState<ProductForm>(() => {
    const base = toForm(product, taxonomy.units);
    if (!draft) return base;
    return { ...base, partNumber: draft.partNumber, nameFa: draft.nameFa, vehicles: draft.vehicles.map((v) => ({ vehicleId: v.vehicleId, modelId: v.modelId })) };
  });
  const vehicleOptions = useApi<VehicleOption[]>('/admin/vehicles/options');
  // Active units, plus the product's own unit when it was deactivated later.
  const unitOptions = taxonomy.units.filter((u) => u.active || u.id === product?.unitId);
  const selectedUnit = taxonomy.units.find((u) => u.id === f.unitId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; sku: string } | null>(draft?.existingProductId ? { id: draft.existingProductId, sku: '' } : null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<'saved' | 'published' | null>(() => (search.get('saved') === 'published' ? 'published' : search.get('saved') ? 'saved' : null));
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [partialSavedId, setPartialSavedId] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  // A category or part maker added from this form, without leaving it.
  const [quick, setQuick] = useState<'category' | 'maker' | null>(null);
  const [added, setAdded] = useState<{ categories: Named[]; makers: Named[] }>({ categories: [], makers: [] });
  // Photos chosen before the first save: uploaded right after the part is created.
  const [queued, setQueued] = useState<File[]>([]);
  const previews = useMemo(() => queued.map((file) => ({ file, url: URL.createObjectURL(file) })), [queued]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);
  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const fail = (e: unknown) => setGeneral(errorText(t, e));
  const locked = readOnly || saving || !!partialSavedId;
  const canStock = rights.stock && (!product || !!product.inventory);
  const photoCount = (product?.media.length ?? 0) + queued.length;

  const save = async (publishToo: boolean) => {
    if (locked) return;
    const e: Record<string, string> = {};
    if (f.sku.trim() && !/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/.test(f.sku.trim())) e['pf-sku'] = `${t('admin.sku')}: ${l('فقط حروف انگلیسی، عدد و . _ - /', 'Latin letters, digits and . _ - / only')}`;
    if (!f.sku.trim() && !f.partNumber.trim() && !product) e['pf-partnumber'] = l('شمارهٔ فنی را بنویسید. اگر قطعه شمارهٔ فنی ندارد، در «اطلاعات تکمیلی» یک کد کالا بدهید.', 'Enter the part number. If the part has none, give it a SKU under “More details”.');
    if (f.nameFa.trim().length < 2) e['pf-namefa'] = `${t('admin.name')} (FA): ${t('validation.required')}`;
    if (!f.categoryId) e['pf-category'] = `${t('parts.category')}: ${t('validation.required')}`;
    if (!f.unitId) e['pf-unit'] = `${t('parts.unit')}: ${t('validation.required')}`;
    const pack = typedNumber(f.packQuantity);
    if (!Number.isInteger(pack) || pack < 1 || pack > 10000) e['pf-pack'] = l('تعداد در بسته باید عدد صحیح از ۱ تا ۱۰۰۰۰ باشد.', 'Pack quantity must be a whole number from 1 to 10000.');
    if (f.countryOfManufacture && !/^[A-Z]{2}$/.test(f.countryOfManufacture)) e['pf-country'] = l('کد دوحرفی کشور را بنویسید؛ مثلاً DE.', 'Use a two-letter country code, e.g. DE.');
    f.specs.forEach((spec, i) => { if (!!spec.labelFa.trim() !== !!spec.value.trim()) e[`pf-${spec.labelFa.trim() ? 'sv' : 'sl'}-${i}`] = l('عنوان و مقدار مشخصه را هر دو تکمیل کنید یا ردیف را حذف کنید.', 'Complete both label and value or remove the row.'); });
    const unitRule = selectedUnit ? { name: selectedUnit.name, allowDecimal: selectedUnit.allowDecimal, stepMilli: Math.round(selectedUnit.step * 1000) } : null;
    const quantityError = selectedUnit ? t('parts.quantityInvalid', { step: formatQuantity(selectedUnit.step, 'fa'), unit: selectedUnit.name }) : t('validation.invalidNumber');
    const threshold = typedNumber(f.lowStockThreshold || '0');
    if (unitRule && !(threshold === 0 || isValidQuantity(threshold, unitRule))) e['pf-threshold'] = quantityError;
    // The price is optional: without it the part is shown with «درخواست تأمین».
    let baseMinor: string | null = null;
    if (f.basePrice.trim()) {
      try {
        const v = f.baseCurrency === 'IRR' ? tomanTextToRial(f.basePrice) : parseDecimalAmount(f.basePrice, 'AED');
        if (v <= 0n) throw new Error();
        baseMinor = v.toString();
      } catch {
        e['pf-price'] = `${t('admin.price')}: ${t('validation.invalidNumber')}`;
      }
    }
    let manualIrr: string | null = null;
    let manualAed: string | null = null;
    try { manualIrr = f.manualIrr.trim() ? tomanTextToRial(f.manualIrr).toString() : null; } catch { e['pf-manualirr'] = t('validation.invalidNumber'); }
    try { manualAed = f.manualAed.trim() ? parseDecimalAmount(f.manualAed, 'AED').toString() : null; } catch { e['pf-manualaed'] = t('validation.invalidNumber'); }
    if (!baseMinor && (manualIrr || manualAed)) e['pf-price'] = l('قیمت ثابت بدون قیمت اصلی ممکن نیست.', 'A fixed price needs a main price.');
    // Stock is a physical count: sent to the stock ledger only when it changed.
    let newStock: number | null = null;
    if (canStock && f.stock.trim()) {
      const n = typedNumber(f.stock);
      const reserved = product?.inventory?.reserved ?? 0;
      if (!Number.isFinite(n) || n < 0 || (n > 0 && unitRule && !isValidQuantity(n, unitRule))) e['pf-stock'] = quantityError;
      else if (n < reserved) e['pf-stock'] = l('موجودی نمی‌تواند از مقدار رزروشده برای سفارش‌ها کمتر باشد.', 'Stock cannot be lower than the quantity reserved for orders.');
      else if (n !== (product?.inventory?.onHand ?? 0)) newStock = n;
    }
    for (const v of f.vehicles) {
      const y = f.years[fitKey(v)];
      const from = y ? year(y.yearFrom) : null;
      const to = y ? year(y.yearTo) : null;
      const bad = (n: number | null) => n !== null && (!Number.isInteger(n) || !((n >= 1300 && n <= 1500) || (n >= 1950 && n <= 2100)));
      if (bad(from) || bad(to) || (from !== null && to !== null && (to < from || (from < 1600) !== (to < 1600)))) e['pf-years'] = l('سال‌ها صحیح، چهاررقمی و همگی شمسی یا همگی میلادی باشند؛ سال پایان از آغاز کمتر نباشد.', 'Use whole four-digit years in one calendar, with the end no earlier than the start.');
    }
    if (publishToo && f.condition !== 'NEW' && !photoCount) e['pf-condition'] = l('قطعهٔ کارکرده یا بازسازی‌شده بدون عکس واقعی منتشر نمی‌شود؛ عکس بگذارید یا فقط ذخیره کنید.', 'A used or refurbished part cannot be published without a real photo; add a photo or just save.');
    setErrors(e);
    setGeneral(null);
    setSaved(null);
    if (Object.keys(e).some(isExtraField)) setExtraOpen(true);
    if (Object.keys(e).length) return;
    setSaving(true);
    let writtenId: string | undefined;
    try {
      const body = {
        ...(f.sku.trim() ? { sku: f.sku.trim() } : {}), ...(f.slug ? { slug: f.slug } : {}), partNumber: f.partNumber.trim() || null,
        equivalents: list(f.equivalents), replacements: list(f.replacements), nameFa: f.nameFa.trim(), nameEn: f.nameEn.trim() || null,
        aliases: f.aliases.split(/[،,]/).map((s) => s.trim()).filter(Boolean), descriptionFa: f.descriptionFa || null, descriptionEn: f.descriptionEn || null,
        categoryId: f.categoryId, manufacturerBrandId: f.manufacturerBrandId || null, vehicleBrandIds: f.vehicleBrandIds,
        vehicles: f.vehicles.map((v) => {
          const y = f.years[fitKey(v)];
          return { vehicleId: v.vehicleId, modelId: v.modelId, yearFrom: y ? year(y.yearFrom) : null, yearTo: y ? (year(y.yearTo) ?? year(y.yearFrom)) : null, note: y?.note.trim() || null };
        }),
        partType: f.partType, condition: f.condition,
        origin: f.origin, countryOfManufacture: f.countryOfManufacture || null, warrantyFa: f.warrantyFa || null, warrantyEn: f.warrantyEn || null, unitId: f.unitId,
        packQuantity: pack, oemCodes: list(f.oemCodes),
        specs: f.specs.filter((s) => s.labelFa.trim() && s.value.trim()).map((s, i) => ({ key: s.key || `spec-${i + 1}`, labelFa: s.labelFa.trim(), ...(s.labelEn ? { labelEn: s.labelEn } : {}), value: s.value.trim() })),
        basePrice: baseMinor ? { currency: f.baseCurrency, amountMinor: baseMinor } : null, manualPriceIrr: manualIrr, manualPriceAed: manualAed,
        lowStockThreshold: typedNumber(f.lowStockThreshold) || 0, isSellable: f.isSellable, ...(product ? { version: product.version } : {}),
      };
      const res = await api<{ id: string; version: number }>(product ? `/admin/products/${product.id}` : '/admin/products', { method: product ? 'PUT' : 'POST', body });
      writtenId = res.id;
      if (newStock !== null) {
        const fresh = await api<AdminProduct>(`/admin/products/${res.id}`);
        await api('/admin/inventory/adjust', { method: 'POST', body: { productId: res.id, newOnHand: newStock, reason: product ? 'PHYSICAL_COUNT' : 'RECEIVED', expectedVersion: fresh.inventory?.version ?? 0 } });
      }
      for (const file of queued) {
        const form = new FormData();
        form.append('file', file);
        await uploadWithProgress(`/admin/products/${res.id}/media`, form, () => undefined).promise;
      }
      setQueued([]);
      if (publishToo) {
        const fresh = await api<{ version: number }>(`/admin/products/${res.id}`);
        await api(`/admin/products/${res.id}/publish`, { method: 'POST', body: { published: true, version: fresh.version } });
      }
      if (!product) router.replace(`/admin/products/${res.id}?saved=${publishToo ? 'published' : '1'}`);
      else { setSaved(publishToo ? 'published' : 'saved'); await reload?.(); }
    } catch (err) {
      if (writtenId && !product) { setPartialSavedId(writtenId); setGeneral(l('قطعه ثبت شده، اما موجودی، عکس‌ها یا انتشار کامل نشده است. برای جلوگیری از ثبت تکراری، قطعهٔ ثبت‌شده را باز کنید و همان‌جا ادامه دهید.', 'The part was saved, but stock, photos or publication did not finish. Open the saved part to continue without creating a duplicate.')); return; }
      if (isApiError(err) && err.code === 'PART_NUMBER_EXISTS') {
        const d = err.details as { id?: string; sku?: string } | undefined;
        if (d?.id) setExisting({ id: d.id, sku: d.sku ?? '' });
        setErrors({ 'pf-partnumber': l(`این شمارهٔ فنی (با هر شکل نوشتن) برای همین برند سازنده قبلاً ثبت شده است${d?.sku ? ` (کد کالا ${d.sku})` : ''}.`, `This part number (written any way) already exists for this part brand${d?.sku ? ` (SKU ${d.sku})` : ''}.`) });
      } else {
        fail(err);
        // The part itself may already be saved (stock, photos or publishing failed after it): show its current state.
        if (writtenId) await reload?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const unpublish = async () => {
    if (!product) return;
    setActionBusy(true);
    try { await api(`/admin/products/${product.id}/publish`, { method: 'POST', body: { published: false, version: product.version } }); setSaved(null); await reload?.(); } catch (e) { fail(e); } finally { setActionBusy(false); }
  };
  const archive = async () => {
    if (!product) return;
    setActionBusy(true);
    try { await api(`/admin/products/${product.id}/${product.archived ? 'restore' : 'archive'}`, { method: 'POST', body: { version: product.version } }); setArchiveConfirm(false); setF(v => ({ ...v, isSellable: false })); await reload?.(); } catch (e) { fail(e); } finally { setActionBusy(false); }
  };
  const name = (x: { nameFa: string; nameEn: string | null }) => l(x.nameFa, x.nameEn ?? x.nameFa);
  const vehicleLabel = (v: FitmentValue) => {
    const opt = (vehicleOptions.data ?? []).find((o) => o.id === v.vehicleId);
    const model = v.modelId ? opt?.models.find((m) => m.id === v.modelId) : null;
    return opt ? `${opt.name}${model ? ` ${model.name}` : ` (${t('parts.wholeVehicle')})`}` : v.vehicleId;
  };
  const addPhotos = (files: FileList) => {
    const ok = [...files].filter((file) => file.size <= PHOTO_MAX_BYTES && (PHOTO_TYPES.includes(file.type) || PHOTO_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))));
    setQueued((q) => [...q, ...ok].slice(0, 20));
  };
  const categories: Named[] = [...taxonomy.categories, ...added.categories].filter((c) => c.active !== false || c.id === f.categoryId);
  const makers: Named[] = [...taxonomy.manufacturers, ...added.makers].filter((m) => m.active !== false || m.id === f.manufacturerBrandId);
  const unitLabel = selectedUnit ? l(selectedUnit.name, selectedUnit.nameEn || selectedUnit.name) : '';
  // What the site will show for this part as it stands; nothing here blocks saving.
  const notes: string[] = [];
  if (!f.basePrice.trim()) notes.push(l('قیمت ندارد: در سایت به‌جای «افزودن به سبد»، دکمهٔ «درخواست تأمین» نشان داده می‌شود.', 'No price: the site shows “Request this part” instead of “Add to cart”.'));
  if (!photoCount) notes.push(f.condition === 'NEW' ? l('عکس ندارد.', 'No photo.') : l('عکس ندارد: قطعهٔ کارکرده یا بازسازی‌شده بدون عکس واقعی منتشر نمی‌شود.', 'No photo: a used or refurbished part cannot be published without a real photo.'));
  if (!f.vehicles.length) notes.push(l('خودرویی برای آن انتخاب نشده است.', 'No vehicle is selected for it.'));
  const smallButton = 'mt-1 cursor-pointer self-start text-sm font-semibold text-action underline underline-offset-4';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product ? product.nameFa : t('admin.newProduct')}
        description={product ? <span className="flex flex-wrap items-center gap-2"><Code>{product.sku}</Code>{product.archived ? <Badge tone="danger">{t('admin.archived')}</Badge> : product.published ? <Badge tone="success">{l('منتشرشده در سایت', 'Published on the site')}</Badge> : <Badge>{l('پیش‌نویس — در سایت دیده نمی‌شود', 'Draft — not on the site')}</Badge>}</span> : l('فقط نام و دسته الزامی است. بقیه را هر وقت خواستید کامل کنید؛ قطعه تا «انتشار» در سایت دیده نمی‌شود.', 'Only the name and category are required. Complete the rest whenever you like; the part is not on the site until published.')}
        actions={product && !readOnly ? (
          <div className="flex flex-wrap gap-2">
            {product.published && rights.publish ? <Button variant="secondary" disabled={saving || actionBusy} onClick={() => void unpublish()}>{t('admin.unpublish')}</Button> : null}
            <Button variant="ghost" disabled={saving || actionBusy} onClick={() => setArchiveConfirm(true)}>{product.archived ? l('بازگرداندن از بایگانی', 'Restore archived part') : t('admin.archive')}</Button>
          </div>
        ) : null}
      />
      {readOnly ? <Alert tone="info" title={l('دسترسی شما فقط برای مشاهده است.', 'Your access is read only.')} /> : null}
      <Dialog open={archiveConfirm} onOpenChange={open => { if (!actionBusy) setArchiveConfirm(open); }} closeLabel={l('بستن', 'Close')} title={product?.archived ? l('بازگرداندن قطعه', 'Restore part') : l('بایگانی قطعه', 'Archive part')}><p className="mb-4 leading-8">{product?.archived ? l('قطعه به فهرست برمی‌گردد؛ انتشار و قابلیت فروش خاموش می‌مانند تا خودتان بررسی و فعال کنید.', 'The part returns to the list; publishing and sales remain off until you review and enable them.') : l('قطعه از سایت و فروش خارج می‌شود. سوابق، عکس‌ها و موجودی حفظ می‌شوند و بعداً می‌توانید آن را بازگردانید.', 'The part is removed from the storefront and sales. History, photos and stock are retained, and the part can be restored later.')}</p><Button variant={product?.archived ? 'primary' : 'danger'} loading={actionBusy} onClick={() => void archive()}>{l('تأیید', 'Confirm')}</Button></Dialog>
      {quick ? (
        <QuickAddDialog kind={quick} close={() => setQuick(null)} done={(row) => {
          if (quick === 'category') { setAdded((a) => ({ ...a, categories: [...a.categories, row] })); set('categoryId', row.id); } else { setAdded((a) => ({ ...a, makers: [...a.makers, row] })); set('manufacturerBrandId', row.id); }
          setQuick(null);
        }} />
      ) : null}
      {partialSavedId ? <Alert tone="warning" title={l('ادامهٔ تکمیل قطعه', 'Continue the saved part')}><Link href={`/admin/products/${partialSavedId}`} className="font-semibold text-action underline">{l('باز کردن قطعهٔ ثبت‌شده و تکمیل عکس‌ها', 'Open the saved part and finish photos')}</Link></Alert> : null}
      {draft?.unmatchedVehicles.length ? <Alert tone="warning" title={l(`این خودروها در پنل نیستند و اضافه نشدند: ${draft.unmatchedVehicles.join('، ')}`, `These vehicles are not in the panel and were not added: ${draft.unmatchedVehicles.join(', ')}`)} /> : null}
      {existing ? (
        <Alert tone="warning" title={l('قطعه‌ای با همین شمارهٔ فنی از قبل هست.', 'A part with this part number already exists.')}>
          <Link href={`/admin/products/${existing.id}`} className="font-semibold text-action underline">{l('باز کردن قطعهٔ موجود', 'Open the existing part')}{existing.sku ? ` (${existing.sku})` : ''}</Link>
        </Alert>
      ) : null}
      <ErrorSummary title={t('validation.summaryTitle')} errors={Object.entries(errors).map(([fieldId, message]) => ({ fieldId, message }))} generalError={general} />
      {saved ? <Alert tone="success" title={saved === 'published' ? l('قطعه ذخیره و در سایت منتشر شد.', 'The part was saved and published on the site.') : product?.published ? l('تغییرات ذخیره شد و در سایت اعمال شده است.', 'Changes were saved and are live on the site.') : l('قطعه به‌صورت پیش‌نویس ذخیره شد؛ هنوز در سایت دیده نمی‌شود.', 'The part was saved as a draft; it is not on the site yet.')} /> : null}
      <form id="pf-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(false); }} className="flex flex-col gap-6">
        <fieldset disabled={locked} className="contents"><legend className="sr-only">{l('اطلاعات قطعه', 'Part details')}</legend>
        <Section title={l('۱. اطلاعات اصلی', '1. Main details')} id="pf-main">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="pf-namefa" label={l('نام قطعه', 'Part name (Persian)')} error={errors['pf-namefa']} required className="md:col-span-2"><Input id="pf-namefa" value={f.nameFa} invalid={!!errors['pf-namefa']} onChange={(e) => set('nameFa', e.target.value)} /></Field>
            <Field id="pf-partnumber" label={t('parts.partNumber')} error={errors['pf-partnumber']} hint={l('شمارهٔ روی قطعه یا کاتالوگ. فاصله و خط تیره مهم نیست.', 'The number on the part or in the catalog. Spaces and dashes do not matter.')}>
              <Input id="pf-partnumber" dir="ltr" maxLength={80} value={f.partNumber} invalid={!!errors['pf-partnumber']} onChange={(e) => set('partNumber', e.target.value)} />
            </Field>
            <div className="flex flex-col">
              <Field id="pf-category" label={t('parts.category')} error={errors['pf-category']} required>
                <Select id="pf-category" value={f.categoryId} invalid={!!errors['pf-category']} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">{l('انتخاب دسته', 'Choose a category')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
                </Select>
              </Field>
              <button type="button" className={smallButton} onClick={() => setQuick('category')}>{l('دسته در فهرست نیست؟ افزودن دستهٔ جدید', 'Not listed? Add a category')}</button>
            </div>
            <div className="flex flex-col">
              <Field id="pf-maker" label={t('parts.maker')} hint={l('شرکتی که قطعه را ساخته است (مثل بوش)، نه برند خودرو.', 'The company that made the part (e.g. Bosch), not the vehicle make.')} optionalLabel={t('common.optional')}>
                <Select id="pf-maker" value={f.manufacturerBrandId} onChange={(e) => set('manufacturerBrandId', e.target.value)}>
                  <option value="">—</option>
                  {makers.map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
                </Select>
              </Field>
              <button type="button" className={smallButton} onClick={() => setQuick('maker')}>{l('سازنده در فهرست نیست؟ افزودن سازندهٔ جدید', 'Not listed? Add a maker')}</button>
            </div>
            <Field id="pf-type" label={t('parts.partType')}>
              <Select id="pf-type" value={f.partType} onChange={(e) => set('partType', e.target.value)}>{(['GENUINE', 'OEM', 'AFTERMARKET'] as const).map((v) => <option key={v} value={v}>{t(`partType.${v}`)}</option>)}</Select>
            </Field>
            <Field id="pf-condition" label={t('parts.condition')} error={errors['pf-condition']} hint={f.condition === 'NEW' ? undefined : l('برای انتشار، عکس واقعی همین قلم لازم است.', 'A real photo of this item is needed to publish.')}>
              <Select id="pf-condition" value={f.condition} invalid={!!errors['pf-condition']} onChange={(e) => set('condition', e.target.value)}>{(['NEW', 'USED', 'REFURBISHED'] as const).map((v) => <option key={v} value={v}>{t(`condition.${v}`)}</option>)}</Select>
            </Field>
          </div>
        </Section>
        <Section title={l('۲. کاربرد در خودرو', '2. Vehicle fitment')} id="pf-fit">
          <VehiclePicker id="pf-vehicles" value={f.vehicles} onChange={(v) => set('vehicles', v)} options={vehicleOptions.data ?? []} onOptionsChanged={vehicleOptions.reload} />
          {f.vehicles.length ? (
            <div className="mt-4" id="pf-years" tabIndex={-1}>
              <p className="mb-2 text-sm font-semibold">{l('سال‌های کاربرد (اختیاری)', 'Fitment years (optional)')}</p>
              {errors['pf-years'] ? <p className="mb-2 text-sm text-danger">{errors['pf-years']}</p> : null}
              <ul className="flex flex-col gap-2">
                {f.vehicles.map((v) => {
                  const k = fitKey(v);
                  const y = f.years[k] ?? { yearFrom: '', yearTo: '', note: '' };
                  const put = (patch: Partial<YearRow>) => set('years', { ...f.years, [k]: { ...y, ...patch } });
                  return (
                    <li key={k} className="grid items-end gap-2 rounded-[var(--radius-control)] border border-line-soft p-2 sm:grid-cols-[1fr_7rem_7rem_1fr]">
                      <span className="text-sm font-semibold">{vehicleLabel(v)}</span>
                      <Field id={`pf-yf-${k}`} label={l('از سال', 'From')}><Input id={`pf-yf-${k}`} dir="ltr" inputMode="numeric" maxLength={4} value={y.yearFrom} onChange={(e) => put({ yearFrom: e.target.value })} /></Field>
                      <Field id={`pf-yt-${k}`} label={l('تا سال', 'To')}><Input id={`pf-yt-${k}`} dir="ltr" inputMode="numeric" maxLength={4} value={y.yearTo} onChange={(e) => put({ yearTo: e.target.value })} /></Field>
                      <Field id={`pf-yn-${k}`} label={t('parts.note')}><Input id={`pf-yn-${k}`} maxLength={200} value={y.note} onChange={(e) => put({ note: e.target.value })} /></Field>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Section>
        <Section title={l('۳. قیمت و موجودی', '3. Price & stock')} id="pf-price-section">
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="pf-price" label={f.baseCurrency === 'IRR' ? l('قیمت هر واحد (تومان)', 'Unit price (toman)') : l('قیمت هر واحد (درهم)', 'Unit price (dirham)')} hint={l('خالی بماند: قطعه با «درخواست تأمین» نمایش داده می‌شود.', 'Left empty: the part is shown with “Request this part”.')} error={errors['pf-price']} optionalLabel={t('common.optional')}>
              <Input id="pf-price" dir="ltr" inputMode="decimal" value={f.basePrice} invalid={!!errors['pf-price']} onChange={(e) => set('basePrice', e.target.value)} />
            </Field>
            <Field id="pf-currency" label={l('واحد قیمت', 'Price currency')} hint={f.baseCurrency === 'AED' ? l('قیمت درهمی با نرخ روز به تومان تبدیل می‌شود.', 'A dirham price is converted to toman at the current rate.') : undefined}>
              <Select id="pf-currency" value={f.baseCurrency} onChange={(e) => set('baseCurrency', e.target.value as 'IRR' | 'AED')}>
                <option value="IRR">{l('تومان', 'Toman')}</option>
                <option value="AED">{l('درهم', 'Dirham')}</option>
              </Select>
            </Field>
            {f.baseCurrency === 'AED' || f.manualIrr.trim() ? (
              <Field id="pf-manualirr" label={l('قیمت فروش ثابت (تومان)', 'Fixed selling price (toman)')} hint={l('اگر پر شود، به‌جای تبدیل خودکار همین مبلغ فروخته می‌شود.', 'When set, this amount is charged instead of the automatic conversion.')} error={errors['pf-manualirr']} optionalLabel={t('common.optional')}>
                <Input id="pf-manualirr" dir="ltr" inputMode="numeric" value={f.manualIrr} invalid={!!errors['pf-manualirr']} onChange={(e) => set('manualIrr', e.target.value)} />
              </Field>
            ) : null}
            {canStock ? (
              <Field id="pf-stock" label={`${l('موجودی انبار', 'Stock on hand')}${unitLabel ? ` (${unitLabel})` : ''}`} error={errors['pf-stock']}
                hint={product?.inventory?.reserved ? l(`${formatQuantity(product.inventory.reserved, 'fa')} ${unitLabel} از آن برای سفارش‌ها رزرو است.`, `${product.inventory.reserved} ${unitLabel} of it is reserved for orders.`) : l('تعداد موجود در انبار.', 'The quantity in the warehouse.')}>
                <Input id="pf-stock" dir="ltr" inputMode={selectedUnit?.allowDecimal ? 'decimal' : 'numeric'} placeholder="0" value={f.stock} invalid={!!errors['pf-stock']} onChange={(e) => set('stock', e.target.value)} />
              </Field>
            ) : product?.inventory ? (
              <p className="text-sm text-steel">{t('admin.available')}: <Quantity value={Math.round((product.inventory.onHand - product.inventory.reserved) * 1000) / 1000} unit={product.unit} /></p>
            ) : null}
            <Checkbox id="pf-sellable" className="md:col-span-3" label={l('قابل فروش در سایت (اگر خاموش شود، قطعه دیده می‌شود ولی خریدنی نیست)', 'Sellable on the site (when off, the part is shown but cannot be bought)')} checked={f.isSellable} onChange={(e) => set('isSellable', e.target.checked)} />
          </div>
          {product?.basePrice && product.priceExplanation.unitPayableIrr && (product.basePrice.currency === 'AED' || product.priceExplanation.warnings.length) ? (
            <p className="mt-4 text-sm text-steel">{l('مبلغ فعلی برای مشتری', 'Current amount for customers')}: <PanelPrice value={{ currency: 'IRR', amountMinor: product.priceExplanation.unitPayableIrr }} /> ({priceSource(product.priceExplanation.source)})</p>
          ) : null}
          {product?.basePrice && !product.priceExplanation.unitPayableIrr ? <p className="mt-4 text-sm text-warning">{l('برای این قیمت نرخ تبدیل معتبری نیست؛ در سایت «استعلام قیمت» نشان داده می‌شود.', 'There is no valid rate for this price; the site shows “Price on request”.')}</p> : null}
        </Section>
        <details className="card p-4 md:p-6" open={extraOpen} onToggle={(e) => setExtraOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer text-lg font-bold">{l('اطلاعات تکمیلی (اختیاری)', 'More details (optional)')}<span className="ms-2 text-sm font-medium text-steel">{l('شماره‌های معادل، نام انگلیسی، مشخصات فنی، توضیحات، واحد فروش', 'Equivalent numbers, English name, specs, description, sales unit')}</span></summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field id="pf-equivalents" label={t('parts.equivalents')} hint={l('همین قطعه از سازنده‌های دیگر؛ با «،» یا «,» جدا کنید. مشتری با این شماره‌ها هم قطعه را پیدا می‌کند.', 'The same part from other makers; separate with commas. Customers also find the part by these numbers.')} optionalLabel={t('common.optional')}>
              <Textarea id="pf-equivalents" dir="ltr" rows={2} value={f.equivalents} onChange={(e) => set('equivalents', e.target.value)} />
            </Field>
            <Field id="pf-replacements" label={t('parts.replacements')} hint={l('شماره‌ای که جایگزین این قطعه شده است.', 'Numbers that replace this part.')} optionalLabel={t('common.optional')}>
              <Textarea id="pf-replacements" dir="ltr" rows={2} value={f.replacements} onChange={(e) => set('replacements', e.target.value)} />
            </Field>
            <Field id="pf-nameen" label={l('نام انگلیسی', 'English name')} optionalLabel={t('common.optional')}><Input id="pf-nameen" dir="ltr" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field>
            <Field id="pf-aliases" label={l('نام‌های دیگر قطعه (برای جست‌وجو)', 'Other names (for search)')} hint={l('مثل نام بازاری؛ با «،» جدا کنید.', 'Such as trade names; separate with commas.')} optionalLabel={t('common.optional')}><Input id="pf-aliases" value={f.aliases} onChange={(e) => set('aliases', e.target.value)} /></Field>
            <Field id="pf-sku" label={t('admin.sku')} error={errors['pf-sku']} hint={product ? undefined : l('خالی بماند تا از شمارهٔ فنی ساخته شود.', 'Leave empty to make it from the part number.')} {...(product ? { required: true } : { optionalLabel: t('common.optional') })}>
              <Input id="pf-sku" dir="ltr" value={f.sku} invalid={!!errors['pf-sku']} onChange={(e) => set('sku', e.target.value)} />
            </Field>
            <Field id="pf-unit" label={t('parts.unit')} required error={errors['pf-unit']}
              hint={selectedUnit ? (selectedUnit.allowDecimal ? l(`اعشاری، با گام ${formatQuantity(selectedUnit.step, 'fa')}`, `Decimals, step ${selectedUnit.step}`) : l('فقط عدد صحیح', 'Whole numbers only')) : undefined}>
              <Select id="pf-unit" value={f.unitId} onChange={(e) => set('unitId', e.target.value)} invalid={!!errors['pf-unit']}>
                {!f.unitId ? <option value="">{l('انتخاب واحد', 'Choose a unit')}</option> : null}
                {unitOptions.map((u) => <option key={u.id} value={u.id}>{l(u.name, u.nameEn || u.name)}{u.active ? '' : l(' (غیرفعال)', ' (inactive)')}</option>)}
              </Select>
            </Field>
            <Field id="pf-pack" label={t('parts.pack')} error={errors['pf-pack']}><Input id="pf-pack" inputMode="numeric" value={f.packQuantity} invalid={!!errors['pf-pack']} onChange={(e) => set('packQuantity', e.target.value)} /></Field>
            <Field id="pf-threshold" label={`${l('هشدار کمبود موجودی از', 'Warn when stock falls to')}${unitLabel ? ` (${unitLabel})` : ''}`} error={errors['pf-threshold']}><Input id="pf-threshold" inputMode={selectedUnit?.allowDecimal ? 'decimal' : 'numeric'} value={f.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} /></Field>
            <Field id="pf-origin" label={t('parts.origin')}>
              <Select id="pf-origin" value={f.origin} onChange={(e) => set('origin', e.target.value)}>{(['DOMESTIC', 'IMPORTED', 'UNKNOWN'] as const).map((v) => <option key={v} value={v}>{t(`origin.${v}`)}</option>)}</Select>
            </Field>
            <Field id="pf-country" label={t('parts.country')} error={errors['pf-country']} hint={l('کد دوحرفی؛ مثلاً DE برای آلمان، JP برای ژاپن.', 'Two-letter code, e.g. DE, JP.')} optionalLabel={t('common.optional')}><Input id="pf-country" dir="ltr" maxLength={2} value={f.countryOfManufacture} invalid={!!errors['pf-country']} onChange={(e) => set('countryOfManufacture', e.target.value.toUpperCase())} /></Field>
            <fieldset className="flex flex-col gap-1 md:col-span-2">
              <legend className="text-sm font-semibold">{t('parts.vehicleBrands')}</legend>
              <div className="flex flex-wrap gap-x-4">
                {taxonomy.vehicleBrands.filter(b => b.active !== false || f.vehicleBrandIds.includes(b.id)).map((b) => (
                  <Checkbox key={b.id} id={`pf-vb-${b.id}`} label={name(b)} checked={f.vehicleBrandIds.includes(b.id)}
                    onChange={(e) => set('vehicleBrandIds', e.target.checked ? [...f.vehicleBrandIds, b.id] : f.vehicleBrandIds.filter((x) => x !== b.id))} />
                ))}
              </div>
            </fieldset>
            {f.oemCodes.trim() ? <Field id="pf-oem" label={l('کدهای فنی قدیمی', 'Older technical codes')} hint={l('از ثبت‌های قبلی مانده است؛ شمارهٔ تازه را در «شماره‌های معادل» بنویسید.', 'Kept from earlier records; write new numbers under equivalents.')} className="md:col-span-2"><Input id="pf-oem" dir="ltr" value={f.oemCodes} onChange={(e) => set('oemCodes', e.target.value)} /></Field> : null}
            {f.manualAed.trim() ? <Field id="pf-manualaed" label={l('قیمت درهمی نمایشی', 'Display-only AED price')} error={errors['pf-manualaed']} hint={l('فقط نمایشی است؛ برای حذف، خالی کنید.', 'Display only; clear it to remove.')}><Input id="pf-manualaed" dir="ltr" inputMode="decimal" value={f.manualAed} onChange={(e) => set('manualAed', e.target.value)} /></Field> : null}
          </div>
          <div className="mt-6 border-t border-line-soft pt-4">
            <p className="mb-2 text-sm font-semibold">{t('parts.specs')}</p>
            <div className="flex flex-col gap-2">
              {f.specs.map((s, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <Field id={`pf-sl-${i}`} label={l('عنوان', 'Label')} error={errors[`pf-sl-${i}`]}><Input id={`pf-sl-${i}`} maxLength={100} value={s.labelFa} onChange={(e) => set('specs', f.specs.map((x, j) => (j === i ? { ...x, labelFa: e.target.value } : x)))} /></Field>
                  <Field id={`pf-sv-${i}`} label={l('مقدار', 'Value')} error={errors[`pf-sv-${i}`]}><Input id={`pf-sv-${i}`} dir="auto" maxLength={300} value={s.value} onChange={(e) => set('specs', f.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} /></Field>
                  <Button type="button" variant="ghost" aria-label={l('حذف این مشخصه', 'Remove this spec')} onClick={() => set('specs', f.specs.filter((_, j) => j !== i))}><X aria-hidden className="size-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="secondary" disabled={f.specs.length >= 50} className="self-start" icon={<Plus aria-hidden className="size-4" />} onClick={() => set('specs', [...f.specs, { key: '', labelFa: '', value: '' }])}>{l('افزودن مشخصه', 'Add a spec')}</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field id="pf-descfa" label={t('parts.description')} optionalLabel={t('common.optional')}><Textarea id="pf-descfa" value={f.descriptionFa} onChange={(e) => set('descriptionFa', e.target.value)} /></Field>
            <Field id="pf-descen" label={`${t('parts.description')} (English)`} optionalLabel={t('common.optional')}><Textarea id="pf-descen" dir="ltr" value={f.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} /></Field>
            {f.warrantyFa || f.warrantyEn ? (
              <>
                <Field id="pf-warfa" label={t('parts.warranty')} hint={l('فقط ضمانت واقعی ثبت شود؛ برای حذف، خالی کنید.', 'Only a real warranty may be recorded; clear it to remove.')}><Input id="pf-warfa" value={f.warrantyFa} onChange={(e) => set('warrantyFa', e.target.value)} /></Field>
                <Field id="pf-waren" label={`${t('parts.warranty')} (English)`}><Input id="pf-waren" dir="ltr" value={f.warrantyEn} onChange={(e) => set('warrantyEn', e.target.value)} /></Field>
              </>
            ) : null}
          </div>
        </details>
        </fieldset>
      </form>
      {!product && !readOnly ? (
        <Section title={l('۴. عکس‌ها', '4. Photos')} id="pf-new-photos">
          <p className="mb-3 text-sm text-steel">{l('عکس‌ها را همین حالا انتخاب کنید؛ با ذخیرهٔ قطعه بارگذاری می‌شوند. عکس اول، عکس اصلی است.', 'Choose photos now; they upload when the part is saved. The first is the main photo.')}</p>
          {previews.length ? (
            <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {previews.map((p, i) => (
                <li key={p.url} className="relative rounded-[var(--radius-control)] border border-line-soft p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview before upload */}
                  <img src={p.url} alt="" className="aspect-square w-full object-contain" />
                  {i === 0 ? <Badge tone="info" className="absolute start-1 top-1">{l('اصلی', 'Main')}</Badge> : null}
                  <button type="button" disabled={locked} aria-label={l('حذف این عکس', 'Remove this photo')} className="absolute end-1 top-1 grid size-7 cursor-pointer place-items-center rounded-full bg-white/90 text-danger" onClick={() => setQueued((q) => q.filter((x) => x !== p.file))}><X aria-hidden className="size-4" /></button>
                </li>
              ))}
            </ul>
          ) : null}
          <label htmlFor="pf-photo-input" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 font-semibold">
            <ImagePlus aria-hidden className="size-4" />{l('انتخاب عکس (چندتایی)', 'Choose photos (several)')}
          </label>
          <input id="pf-photo-input" type="file" className="sr-only" multiple disabled={locked} accept={[...PHOTO_TYPES, ...PHOTO_EXTENSIONS].join(',')} onChange={(e) => { if (e.target.files) addPhotos(e.target.files); e.target.value = ''; }} />
        </Section>
      ) : null}
      {product && !readOnly ? <MediaManager product={product} reload={reload} /> : null}
      {(
        <div className="flex flex-col gap-3">
          {notes.length && !product?.archived && !readOnly ? (
            <Alert tone="info" title={l('این قطعه در سایت چطور دیده می‌شود؟', 'How will this part appear on the site?')}>
              <ul className="list-disc ps-5">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {!product?.published && !product?.archived && rights.publish && !readOnly ? <Button type="button" size="lg" disabled={!!partialSavedId} loading={saving} onClick={() => void save(true)}>{l('ذخیره و انتشار', 'Save and publish')}</Button> : null}
            <Button type="submit" form="pf-form" size="lg" disabled={!!partialSavedId || readOnly} variant={product?.published ? 'primary' : 'secondary'} loading={saving}>{t('common.save')}</Button>
            {!product?.published && !product?.archived ? <span className="text-sm text-steel">{l('«ذخیره» قطعه را پیش‌نویس نگه می‌دارد؛ «ذخیره و انتشار» آن را در سایت نشان می‌دهد.', '“Save” keeps the part as a draft; “Save and publish” puts it on the site.')}</span> : null}
          </div>
        </div>
      )}
      {product && !readOnly ? <PriceRules product={product} groups={taxonomy.customerGroups} reload={reload} /> : null}
    </div>
  );
}

/** A category or part maker added without leaving the part form: only its name is asked. */
function QuickAddDialog({ kind, close, done }: { kind: 'category' | 'maker'; close: () => void; done: (row: Named) => void }) {
  const t = useTranslations();
  const l = useL();
  const [nameFa, setNameFa] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (nameFa.trim().length < 2) { setError(l('نام را بنویسید.', 'Enter the name.')); return; }
    setBusy(true);
    setError(null);
    try {
      const names = { nameFa: nameFa.trim(), nameEn: nameEn.trim() || null };
      // A category needs a stable code (used by spreadsheets): made from the English name, or generated.
      const fromName = nameEn.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
      const body = kind === 'maker' ? names : { ...names, code: fromName.length >= 2 ? fromName : `CAT_${Date.now().toString(36).toUpperCase()}` };
      const row = await api<{ id: string }>(kind === 'maker' ? '/admin/manufacturer-brands' : '/admin/categories', { method: 'POST', body });
      done({ id: row.id, ...names, active: true });
    } catch (e) {
      setError(errorText(t, e));
      setBusy(false);
    }
  };
  const onEnter = (e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) close(); }} closeLabel={t('common.close')} title={kind === 'maker' ? l('سازندهٔ جدید قطعه', 'New part maker') : l('دستهٔ جدید', 'New category')}>
      <div className="flex flex-col gap-4">
        <Field id="qa-namefa" label={l('نام فارسی', 'Persian name')} required error={error ?? undefined}><Input id="qa-namefa" value={nameFa} maxLength={120} invalid={!!error} onChange={(e) => setNameFa(e.target.value)} onKeyDown={onEnter} /></Field>
        <Field id="qa-nameen" label={l('نام انگلیسی', 'English name')} hint={l('برای نشانی صفحه و نسخهٔ انگلیسی سایت.', 'Used for the page address and the English site.')} optionalLabel={t('common.optional')}><Input id="qa-nameen" dir="ltr" value={nameEn} maxLength={120} onChange={(e) => setNameEn(e.target.value)} onKeyDown={onEnter} /></Field>
        <div className="flex gap-2"><Button loading={busy} onClick={() => void submit()}>{t('common.add')}</Button><Button variant="secondary" disabled={busy} onClick={close}>{l('انصراف', 'Cancel')}</Button></div>
      </div>
    </Dialog>
  );
}

function MediaManager({ product, reload }: { product: AdminProduct; reload?: () => Promise<void> }) {
  const l = useL();
  const onChange = useCallback(() => void reload?.(), [reload]);
  return (
    <Section title={l('۴. عکس‌ها', '4. Photos')} id="pf-media">
      <ProductPhotoManager productId={product.id} productName={product.nameFa} onChange={onChange} />
    </Section>
  );
}

/** Special prices by customer group or quantity; rarely needed, so folded by default. */
function PriceRules({ product, groups, reload }: { product: AdminProduct; groups: Taxonomy['customerGroups']; reload?: () => Promise<void> }) {
  const t = useTranslations();
  const l = useL();
  const sep = useListSeparator();
  const [r, setR] = useState({ customerGroupId: '', minQty: '1', maxQty: '', currency: 'IRR' as 'IRR' | 'AED', price: '', manualIrr: '' });
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setError(null);
    try {
      await api(`/admin/products/${product.id}/price-rules`, {
        method: 'POST',
        body: {
          customerGroupId: r.customerGroupId || null, minQty: typedNumber(r.minQty), maxQty: r.maxQty ? typedNumber(r.maxQty) : null,
          basePrice: { currency: r.currency, amountMinor: (r.currency === 'IRR' ? tomanTextToRial(r.price) : parseDecimalAmount(r.price, 'AED')).toString() },
          manualPriceIrr: r.currency === 'AED' && r.manualIrr ? tomanTextToRial(r.manualIrr).toString() : null,
        },
      });
      await reload?.();
    } catch (e) {
      setError(isApiError(e) ? errorText(t, e) : t('validation.invalidNumber'));
    }
  };
  const remove = async (ruleId: string) => { await api(`/admin/products/${product.id}/price-rules/${ruleId}`, { method: 'DELETE' }).catch(() => undefined); await reload?.(); };
  const groupName = (id: string | null) => (id ? (groups.find((g) => g.id === id)?.[l('nameFa', 'nameEn') as 'nameFa' | 'nameEn'] ?? id) : l('عمومی', 'Public'));
  const unit = l(product.unit.name, product.unit.nameEn || product.unit.name);
  return (
    <details className="card p-4 md:p-6" open={product.priceRules.length > 0 || undefined}>
      <summary className="cursor-pointer text-lg font-bold" id="pf-rules">{l('قیمت ویژه برای گروه مشتری یا خرید تعدادی (اختیاری)', 'Special prices by customer group or quantity (optional)')}</summary>
      <div className="mt-4">
      {product.priceRules.length ? (
        <ul className="mb-4 flex flex-col gap-2">
          {product.priceRules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line-soft bg-surface px-3 py-2.5 text-sm">
              <span>{groupName(rule.customerGroupId)}{sep}{l('مقدار', 'Qty')} <Num value={rule.minQty} />–{rule.maxQty == null ? '∞' : <Num value={rule.maxQty} />} {unit}{sep}<PanelPrice value={rule.base} /> / {unit}{rule.manualIrr ? <>{sep}{l('قیمت ثابت', 'Fixed price')}: <PanelPrice value={{ currency: 'IRR', amountMinor: rule.manualIrr }} /></> : null}</span>
              {rule.active ? <Button size="sm" variant="ghost" onClick={() => void remove(rule.id)}>{t('common.remove')}</Button> : <Badge>{l('غیرفعال', 'Inactive')}</Badge>}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3 md:grid-cols-6">
        <Field id="pr-group" label={l('گروه', 'Group')}>
          <Select id="pr-group" value={r.customerGroupId} onChange={(e) => setR({ ...r, customerGroupId: e.target.value })}>
            <option value="">{l('عمومی', 'Public')}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{l(g.nameFa, g.nameEn)}</option>)}
          </Select>
        </Field>
        <Field id="pr-min" label={l(`از (${product.unit.name})`, `Min (${product.unit.nameEn || product.unit.name})`)}><Input id="pr-min" inputMode={product.unit.allowDecimal ? 'decimal' : 'numeric'} value={r.minQty} onChange={(e) => setR({ ...r, minQty: e.target.value })} /></Field>
        <Field id="pr-max" label={l(`تا (${product.unit.name})`, `Max (${product.unit.nameEn || product.unit.name})`)} optionalLabel={t('common.optional')}><Input id="pr-max" inputMode={product.unit.allowDecimal ? 'decimal' : 'numeric'} value={r.maxQty} onChange={(e) => setR({ ...r, maxQty: e.target.value })} /></Field>
        <Field id="pr-cur" label={l('واحد قیمت', 'Currency')}>
          <Select id="pr-cur" value={r.currency} onChange={(e) => setR({ ...r, currency: e.target.value as 'IRR' | 'AED' })}><option value="IRR">{l('تومان', 'Toman')}</option><option value="AED">{l('درهم', 'Dirham')}</option></Select>
        </Field>
        <Field id="pr-price" label={t('admin.price')}><Input id="pr-price" dir="ltr" value={r.price} onChange={(e) => setR({ ...r, price: e.target.value })} /></Field>
        {r.currency === 'AED' ? <Field id="pr-irr" label={l('قیمت ثابت (تومان)', 'Fixed price (toman)')} optionalLabel={t('common.optional')}><Input id="pr-irr" dir="ltr" value={r.manualIrr} onChange={(e) => setR({ ...r, manualIrr: e.target.value })} /></Field> : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      <Button className="mt-3" variant="secondary" onClick={() => void add()}>{t('common.add')}</Button>
      </div>
    </details>
  );
}
