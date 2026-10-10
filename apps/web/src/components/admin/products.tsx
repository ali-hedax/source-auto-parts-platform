'use client';

import type { AdminProductRow, MoneyDto } from '@hedax/contracts';
import { minorToDecimalString, parseDecimalAmount } from '@hedax/domain';
import { ImagePlus, Plus } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Async } from '@/components/ui/async';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Money, Num, useListSeparator } from '@/components/ui/format';
import { Alert, Badge, Code, EmptyState, PageHeader, Section, TableScroll, td, th } from '@/components/ui/misc';
import { Link, useRouter } from '@/i18n/navigation';
import { api, uploadWithProgress } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { typedNumber } from '@/lib/numbers';
import { useApi } from '@/lib/use-api';
import { useL, usePriceSourceLabel } from './shell';

interface Taxonomy {
  categories: Array<{ id: string; code: string; nameFa: string; nameEn: string | null }>;
  vehicleBrands: Array<{ id: string; code: string; nameFa: string; nameEn: string | null }>;
  manufacturers: Array<{ id: string; nameFa: string; nameEn: string | null }>;
  customerGroups: Array<{ id: string; key: string; nameFa: string; nameEn: string }>;
}

export function ProductsList() {
  const t = useTranslations();
  const l = useL();
  const priceSource = usePriceSourceLabel();
  const search = useSearchParams();
  const [q, setQ] = useState(search.get('q') ?? '');
  const [applied, setApplied] = useState(q);
  const [archived, setArchived] = useState(false);
  const state = useApi<{ items: AdminProductRow[]; total: number }>(`/admin/products?pageSize=100${applied ? `&q=${encodeURIComponent(applied)}` : ''}${archived ? '&archived=1' : ''}`);
  return (
    <>
      <PageHeader title={t('admin.products')} actions={<ButtonLink href="/admin/products/new" icon={<Plus aria-hidden className="size-4" />}>{t('admin.newProduct')}</ButtonLink>} />
      <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setApplied(q); }}>
        <Field id="ap-q" label={t('common.search')} className="min-w-64 flex-1"><Input id="ap-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Checkbox id="ap-archived" label={t('admin.archived')} checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        <Button type="submit" variant="secondary">{t('common.search')}</Button>
      </form>
      <Async state={state}>
        {(data) => data.items.length ? (
          <TableScroll caption={t('admin.products')}>
            <thead>
              <tr>
                <th className={th}>{t('admin.sku')}</th><th className={th}>{t('admin.name')}</th><th className={th}>{t('admin.price')}</th>
                <th className={th}>{t('admin.priceSource')}</th><th className={th}>{t('admin.onHand')}</th><th className={th}>{t('admin.reserved')}</th>
                <th className={th}>{t('admin.available')}</th><th className={th}>{t('admin.published')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td className={td}><Link href={`/admin/products/${p.id}`} className="font-semibold text-action underline underline-offset-4 hover:text-action-hover"><Code>{p.sku}</Code></Link></td>
                  <td className={td}>{p.nameFa}{p.nameEn ? <span className="block text-xs text-steel">{p.nameEn}</span> : null}</td>
                  <td className={td}><Money value={p.basePrice} /></td>
                  <td className={td}><span className="text-xs">{priceSource(p.priceSource)}</span></td>
                  <td className={td}><Num value={p.onHand} /></td>
                  <td className={td}><Num value={p.reserved} /></td>
                  <td className={td}>{p.available <= p.lowStockThreshold ? <Badge tone="warning"><Num value={p.available} /></Badge> : <Num value={p.available} />}</td>
                  <td className={td}>{p.archived ? <Badge tone="danger">{t('admin.archived')}</Badge> : p.published ? <Badge tone="success">{l('بله', 'Yes')}</Badge> : <Badge>{l('خیر', 'No')}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        ) : <EmptyState title={t('parts.empty')} />}
      </Async>
    </>
  );
}

interface ProductForm {
  sku: string; slug: string; nameFa: string; nameEn: string; aliases: string; descriptionFa: string; descriptionEn: string;
  categoryId: string; manufacturerBrandId: string; vehicleBrandIds: string[]; partType: string; condition: string; origin: string;
  countryOfManufacture: string; warrantyFa: string; warrantyEn: string; unit: string; packQuantity: string; oemCodes: string;
  baseCurrency: 'IRR' | 'AED'; basePrice: string; manualIrr: string; manualAed: string; lowStockThreshold: string; isSellable: boolean;
}

interface AdminProduct {
  id: string; sku: string; slug: string; nameFa: string; nameEn: string | null; aliases: string[]; descriptionFa: string | null; descriptionEn: string | null;
  warrantyFa: string | null; warrantyEn: string | null; categoryId: string; manufacturerBrandId: string | null; vehicleBrandIds: string[]; partType: string; condition: string; origin: string;
  countryOfManufacture: string | null; unit: string; packQuantity: number; oemCodes: string[]; published: boolean; archived: boolean; isSellable: boolean; version: number;
  basePrice: { currency: 'IRR' | 'AED'; amountMinor: string; manualIrr: string | null; manualAed: string | null } | null;
  priceExplanation: { source: string; unitPayableIrr: string | null; warnings: string[] };
  priceRules: Array<{ id: string; customerGroupId: string | null; minQty: number; maxQty: number | null; base: MoneyDto; manualIrr: string | null; active: boolean }>;
  inventory: { onHand: number; reserved: number; version: number; lowStockThreshold: number } | null;
  media: Array<{ id: string; storageKey: string; width: number; height: number; altFa: string; isPrimary: boolean }>;
}

const toForm = (p?: AdminProduct): ProductForm => ({
  sku: p?.sku ?? '', slug: p?.slug ?? '', nameFa: p?.nameFa ?? '', nameEn: p?.nameEn ?? '', aliases: (p?.aliases ?? []).join('، '),
  descriptionFa: p?.descriptionFa ?? '', descriptionEn: p?.descriptionEn ?? '', categoryId: p?.categoryId ?? '', manufacturerBrandId: p?.manufacturerBrandId ?? '',
  vehicleBrandIds: p?.vehicleBrandIds ?? [], partType: p?.partType ?? 'GENUINE', condition: p?.condition ?? 'NEW', origin: p?.origin ?? 'DOMESTIC',
  countryOfManufacture: p?.countryOfManufacture ?? '', warrantyFa: p?.warrantyFa ?? '', warrantyEn: p?.warrantyEn ?? '', unit: p?.unit ?? 'عدد',
  packQuantity: String(p?.packQuantity ?? 1), oemCodes: (p?.oemCodes ?? []).join(', '),
  baseCurrency: p?.basePrice?.currency ?? 'IRR', basePrice: p?.basePrice ? minorToDecimalString(BigInt(p.basePrice.amountMinor), p.basePrice.currency) : '',
  manualIrr: p?.basePrice?.manualIrr ?? '', manualAed: p?.basePrice?.manualAed ? minorToDecimalString(BigInt(p.basePrice.manualAed), 'AED') : '',
  lowStockThreshold: String(p?.inventory?.lowStockThreshold ?? 0), isSellable: p?.isSellable ?? true,
});

export function ProductEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const product = useApi<AdminProduct>(isNew ? null : `/admin/products/${id}`);
  const taxonomy = useApi<Taxonomy>('/admin/taxonomy');
  return (
    <Async state={taxonomy}>
      {(tax) => isNew ? <ProductEditor taxonomy={tax} /> : <Async state={product}>{(p) => <ProductEditor taxonomy={tax} product={p} reload={product.reload} />}</Async>}
    </Async>
  );
}

function ProductEditor({ taxonomy, product, reload }: { taxonomy: Taxonomy; product?: AdminProduct; reload?: () => Promise<void> }) {
  const t = useTranslations();
  const l = useL();
  const sep = useListSeparator();
  const priceSource = usePriceSourceLabel();
  const router = useRouter();
  const [f, setF] = useState<ProductForm>(toForm(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const fail = (e: unknown) => setGeneral(errorText(t, e));

  const save = async () => {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/.test(f.sku)) e['pf-sku'] = `${t('admin.sku')}: ${t('validation.required')}`;
    if (f.nameFa.trim().length < 2) e['pf-namefa'] = `${t('admin.name')} (FA): ${t('validation.required')}`;
    if (!f.categoryId) e['pf-category'] = `${t('parts.category')}: ${t('validation.required')}`;
    let baseMinor = '';
    try {
      const v = parseDecimalAmount(f.basePrice, f.baseCurrency);
      if (v <= 0n) throw new Error();
      baseMinor = v.toString();
    } catch {
      e['pf-price'] = `${t('admin.price')}: ${t('validation.invalidNumber')}`;
    }
    let manualIrr: string | null = null;
    let manualAed: string | null = null;
    try { manualIrr = f.manualIrr.trim() ? parseDecimalAmount(f.manualIrr, 'IRR').toString() : null; } catch { e['pf-manualirr'] = t('validation.invalidNumber'); }
    try { manualAed = f.manualAed.trim() ? parseDecimalAmount(f.manualAed, 'AED').toString() : null; } catch { e['pf-manualaed'] = t('validation.invalidNumber'); }
    setErrors(e);
    setGeneral(null);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = {
        sku: f.sku.trim(), ...(f.slug ? { slug: f.slug } : {}), nameFa: f.nameFa.trim(), nameEn: f.nameEn.trim() || null,
        aliases: f.aliases.split(/[،,]/).map((s) => s.trim()).filter(Boolean), descriptionFa: f.descriptionFa || null, descriptionEn: f.descriptionEn || null,
        categoryId: f.categoryId, manufacturerBrandId: f.manufacturerBrandId || null, vehicleBrandIds: f.vehicleBrandIds, partType: f.partType, condition: f.condition,
        origin: f.origin, countryOfManufacture: f.countryOfManufacture || null, warrantyFa: f.warrantyFa || null, warrantyEn: f.warrantyEn || null, unit: f.unit || 'عدد',
        packQuantity: typedNumber(f.packQuantity) || 1, oemCodes: f.oemCodes.split(',').map((s) => s.trim()).filter(Boolean), specs: [],
        basePrice: { currency: f.baseCurrency, amountMinor: baseMinor }, manualPriceIrr: manualIrr, manualPriceAed: manualAed,
        lowStockThreshold: typedNumber(f.lowStockThreshold) || 0, isSellable: f.isSellable, ...(product ? { version: product.version } : {}),
      };
      const res = await api<{ id: string }>(product ? `/admin/products/${product.id}` : '/admin/products', { method: product ? 'PUT' : 'POST', body });
      setSaved(true);
      if (!product) router.replace(`/admin/products/${res.id}`);
      else await reload?.();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const publish = async (published: boolean) => {
    if (!product) return;
    try { await api(`/admin/products/${product.id}/publish`, { method: 'POST', body: { published, version: product.version } }); await reload?.(); } catch (e) { fail(e); }
  };
  const archive = async () => {
    if (!product) return;
    try { await api(`/admin/products/${product.id}/archive`, { method: 'POST', body: { version: product.version } }); await reload?.(); } catch (e) { fail(e); }
  };
  const name = (x: { nameFa: string; nameEn: string | null }) => l(x.nameFa, x.nameEn ?? x.nameFa);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product ? <Code>{product.sku}</Code> : t('admin.newProduct')}
        actions={product ? (
          <div className="flex flex-wrap gap-2">
            {product.archived ? <Badge tone="danger">{t('admin.archived')}</Badge> : product.published
              ? <Button variant="secondary" onClick={() => publish(false)}>{t('admin.unpublish')}</Button>
              : <Button onClick={() => publish(true)}>{t('admin.publish')}</Button>}
            {!product.archived ? <Button variant="ghost" onClick={archive}>{t('admin.archive')}</Button> : null}
          </div>
        ) : null}
      />
      <ErrorSummary title={t('validation.summaryTitle')} errors={Object.entries(errors).map(([fieldId, message]) => ({ fieldId, message }))} generalError={general} />
      {saved ? <Alert tone="success" title={t('common.save')} /> : null}
      {product?.priceExplanation ? (
        <Alert tone={product.priceExplanation.warnings.length ? 'warning' : 'info'} title={`${t('admin.priceSource')}: ${priceSource(product.priceExplanation.source)}`}>
          {product.priceExplanation.unitPayableIrr ? <p><Money value={{ currency: 'IRR', amountMinor: product.priceExplanation.unitPayableIrr }} /></p> : <p>{t('price.inquiry')}</p>}
          {product.priceExplanation.warnings.includes('MANUAL_AED_INCONSISTENT_WITH_IRR') ? <p>{l('قیمت دستی درهم با مبلغ ریالی تسویه هم‌خوان نیست؛ مشتری پیش از پرداخت مبلغ ریالی قطعی را می‌بیند.', 'Manual AED price is inconsistent with the IRR settlement amount; customers see the final IRR amount before paying.')}</p> : null}
        </Alert>
      ) : null}
      <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-6">
        <Section title={l('مشخصات', 'Details')} id="pf-details">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="pf-sku" label={t('admin.sku')} error={errors['pf-sku']} required><Input id="pf-sku" dir="ltr" value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
            <Field id="pf-slug" label="Slug" optionalLabel={t('common.optional')}><Input id="pf-slug" dir="ltr" value={f.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
            <Field id="pf-namefa" label={`${t('admin.name')} (فارسی)`} error={errors['pf-namefa']} required><Input id="pf-namefa" value={f.nameFa} onChange={(e) => set('nameFa', e.target.value)} /></Field>
            <Field id="pf-nameen" label={`${t('admin.name')} (English)`} optionalLabel={t('common.optional')}><Input id="pf-nameen" dir="ltr" value={f.nameEn} onChange={(e) => set('nameEn', e.target.value)} /></Field>
            <Field id="pf-aliases" label={l('نام‌های جایگزین (برای جست‌وجو)', 'Aliases (for search)')} optionalLabel={t('common.optional')}><Input id="pf-aliases" value={f.aliases} onChange={(e) => set('aliases', e.target.value)} /></Field>
            <Field id="pf-category" label={t('parts.category')} error={errors['pf-category']} required>
              <Select id="pf-category" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">—</option>
                {taxonomy.categories.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
              </Select>
            </Field>
            <Field id="pf-maker" label={t('parts.manufacturer')} optionalLabel={t('common.optional')}>
              <Select id="pf-maker" value={f.manufacturerBrandId} onChange={(e) => set('manufacturerBrandId', e.target.value)}>
                <option value="">—</option>
                {taxonomy.manufacturers.map((m) => <option key={m.id} value={m.id}>{name(m)}</option>)}
              </Select>
            </Field>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-semibold">{t('parts.vehicleBrands')}</legend>
              <div className="flex flex-wrap gap-x-4">
                {taxonomy.vehicleBrands.map((b) => (
                  <Checkbox key={b.id} id={`pf-vb-${b.id}`} label={name(b)} checked={f.vehicleBrandIds.includes(b.id)}
                    onChange={(e) => set('vehicleBrandIds', e.target.checked ? [...f.vehicleBrandIds, b.id] : f.vehicleBrandIds.filter((x) => x !== b.id))} />
                ))}
              </div>
            </fieldset>
            <Field id="pf-type" label={t('parts.partType')}>
              <Select id="pf-type" value={f.partType} onChange={(e) => set('partType', e.target.value)}>{(['GENUINE', 'OEM', 'AFTERMARKET'] as const).map((v) => <option key={v} value={v}>{t(`partType.${v}`)}</option>)}</Select>
            </Field>
            <Field id="pf-condition" label={t('parts.condition')} hint={l('«استوک» را با وضعیت دقیق (نو/کارکرده/بازسازی‌شده) ثبت کنید؛ برای کارکرده عکس واقعی همان قلم لازم است.', 'Record stock items with their exact condition; used items need a real photo of that item.')}>
              <Select id="pf-condition" value={f.condition} onChange={(e) => set('condition', e.target.value)}>{(['NEW', 'USED', 'REFURBISHED'] as const).map((v) => <option key={v} value={v}>{t(`condition.${v}`)}</option>)}</Select>
            </Field>
            <Field id="pf-origin" label={t('parts.origin')}>
              <Select id="pf-origin" value={f.origin} onChange={(e) => set('origin', e.target.value)}>{(['DOMESTIC', 'IMPORTED', 'UNKNOWN'] as const).map((v) => <option key={v} value={v}>{t(`origin.${v}`)}</option>)}</Select>
            </Field>
            <Field id="pf-country" label={t('parts.country')} hint="ISO (e.g. DE, JP)" optionalLabel={t('common.optional')}><Input id="pf-country" dir="ltr" maxLength={2} value={f.countryOfManufacture} onChange={(e) => set('countryOfManufacture', e.target.value.toUpperCase())} /></Field>
            <Field id="pf-unit" label={t('parts.unit')}><Input id="pf-unit" value={f.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
            <Field id="pf-pack" label={t('parts.pack')}><Input id="pf-pack" inputMode="numeric" value={f.packQuantity} onChange={(e) => set('packQuantity', e.target.value)} /></Field>
            <Field id="pf-oem" label={t('parts.oemCodes')} hint={l('فقط کدهای مستند؛ موتور کاتالوگ فنی در این نسخه نیست.', 'Only documented codes; no technical catalog engine in this version.')} optionalLabel={t('common.optional')}><Input id="pf-oem" dir="ltr" value={f.oemCodes} onChange={(e) => set('oemCodes', e.target.value)} /></Field>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field id="pf-descfa" label={`${t('parts.description')} (فارسی)`} optionalLabel={t('common.optional')}><Textarea id="pf-descfa" value={f.descriptionFa} onChange={(e) => set('descriptionFa', e.target.value)} /></Field>
            <Field id="pf-descen" label={`${t('parts.description')} (English)`} optionalLabel={t('common.optional')}><Textarea id="pf-descen" dir="ltr" value={f.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} /></Field>
            <Field id="pf-warfa" label={`${t('parts.warranty')} (فارسی)`} hint={l('فقط ضمانت واقعی ثبت شود.', 'Only a real warranty may be recorded.')} optionalLabel={t('common.optional')}><Input id="pf-warfa" value={f.warrantyFa} onChange={(e) => set('warrantyFa', e.target.value)} /></Field>
            <Field id="pf-waren" label={`${t('parts.warranty')} (English)`} optionalLabel={t('common.optional')}><Input id="pf-waren" dir="ltr" value={f.warrantyEn} onChange={(e) => set('warrantyEn', e.target.value)} /></Field>
          </div>
        </Section>
        <Section title={l('قیمت و موجودی', 'Price & stock')} id="pf-price-section">
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="pf-currency" label={l('ارز پایه', 'Base currency')}>
              <Select id="pf-currency" value={f.baseCurrency} onChange={(e) => set('baseCurrency', e.target.value as 'IRR' | 'AED')}>
                <option value="IRR">{t('price.IRR')}</option>
                <option value="AED">{t('price.AED')}</option>
              </Select>
            </Field>
            <Field id="pf-price" label={t('admin.price')} hint={f.baseCurrency === 'IRR' ? l('ریال (نه تومان)', 'Rials (not toman)') : l('درهم، حداکثر دو رقم اعشار', 'Dirham, up to 2 decimals')} error={errors['pf-price']} required>
              <Input id="pf-price" dir="ltr" inputMode="decimal" value={f.basePrice} onChange={(e) => set('basePrice', e.target.value)} />
            </Field>
            <Field id="pf-threshold" label={l('حد هشدار موجودی', 'Low-stock threshold')}><Input id="pf-threshold" inputMode="numeric" value={f.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} /></Field>
            <Field id="pf-manualirr" label={l('قیمت دستی ریالی', 'Manual IRR price')} hint={l('بر تبدیل خودکار مقدم است', 'Overrides automatic conversion')} error={errors['pf-manualirr']} optionalLabel={t('common.optional')}>
              <Input id="pf-manualirr" dir="ltr" inputMode="numeric" value={f.manualIrr} onChange={(e) => set('manualIrr', e.target.value)} />
            </Field>
            <Field id="pf-manualaed" label={l('قیمت دستی درهمی (نمایشی)', 'Manual AED price (display only)')} error={errors['pf-manualaed']} optionalLabel={t('common.optional')}>
              <Input id="pf-manualaed" dir="ltr" inputMode="decimal" value={f.manualAed} onChange={(e) => set('manualAed', e.target.value)} />
            </Field>
            <Checkbox id="pf-sellable" label={l('قابل فروش', 'Sellable')} checked={f.isSellable} onChange={(e) => set('isSellable', e.target.checked)} />
          </div>
          {product?.inventory ? (
            <p className="mt-4 text-sm text-steel">
              {t('admin.onHand')}: <Num value={product.inventory.onHand} />{sep}{t('admin.reserved')}: <Num value={product.inventory.reserved} />{sep}{t('admin.available')}: <Num value={product.inventory.onHand - product.inventory.reserved} /> —{' '}
              <Link href="/admin/inventory" className="text-action underline">{t('admin.adjustStock')}</Link>
            </p>
          ) : null}
        </Section>
        <div><Button type="submit" size="lg" loading={saving}>{t('common.save')}</Button></div>
      </form>
      {product ? <MediaManager product={product} reload={reload} /> : null}
      {product ? <PriceRules product={product} groups={taxonomy.customerGroups} reload={reload} /> : null}
    </div>
  );
}

function MediaManager({ product, reload }: { product: AdminProduct; reload?: () => Promise<void> }) {
  const t = useTranslations();
  const l = useL();
  const [alt, setAlt] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = (file: File | undefined) => {
    if (!file) return;
    if (alt.trim().length < 2) { setError(l('متن جایگزین تصویر را وارد کنید.', 'Enter the image alt text.')); return; }
    const form = new FormData();
    form.append('altFa', alt.trim());
    form.append('file', file);
    setError(null);
    setProgress(0);
    uploadWithProgress(`/admin/products/${product.id}/media`, form, setProgress).promise
      .then(async () => { setProgress(null); setAlt(''); await reload?.(); })
      .catch((e) => { setProgress(null); setError(errorText(t, e)); });
  };
  return (
    <Section title={l('تصاویر', 'Images')} id="pf-media">
      {product.media.length ? (
        <ul className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {product.media.map((m) => (
            <li key={m.id} className="rounded-[var(--radius-control)] border border-line-soft bg-white p-2 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${m.storageKey}`} alt={m.altFa} width={m.width} height={m.height} className="aspect-[4/3] w-full object-contain" loading="lazy" />
              <p className="mt-1">{m.altFa}{m.isPrimary ? <Badge tone="info" className="ms-1">{l('اصلی', 'Primary')}</Badge> : null}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field id="media-alt" label={l('متن جایگزین (فارسی)', 'Alt text (Persian)')} className="min-w-64 flex-1"><Input id="media-alt" value={alt} onChange={(e) => setAlt(e.target.value)} /></Field>
        <input id="media-file" type="file" accept=".jpg,.jpeg,.png,.webp" className="peer sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        <label htmlFor="media-file" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-surface cursor-pointer peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-tech">
          <ImagePlus aria-hidden className="size-4" />{l('بارگذاری تصویر', 'Upload image')}
        </label>
      </div>
      {progress !== null ? <progress className="mt-2 w-full" max={1} value={progress} /> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      <p className="mt-2 text-xs text-steel">{l('تصویر پس از بررسی امنیتی به WebP تبدیل و اطلاعات EXIF حذف می‌شود.', 'Images are security-checked, converted to WebP and stripped of EXIF data.')}</p>
    </Section>
  );
}

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
          basePrice: { currency: r.currency, amountMinor: parseDecimalAmount(r.price, r.currency).toString() },
          manualPriceIrr: r.manualIrr ? parseDecimalAmount(r.manualIrr, 'IRR').toString() : null,
        },
      });
      await reload?.();
    } catch (e) {
      setError(isApiError(e) ? errorText(t, e) : t('validation.invalidNumber'));
    }
  };
  const remove = async (ruleId: string) => { await api(`/admin/products/${product.id}/price-rules/${ruleId}`, { method: 'DELETE' }).catch(() => undefined); await reload?.(); };
  const groupName = (id: string | null) => (id ? (groups.find((g) => g.id === id)?.[l('nameFa', 'nameEn') as 'nameFa' | 'nameEn'] ?? id) : l('عمومی', 'Public'));
  return (
    <Section title={l('قواعد قیمت گروه و تعداد', 'Group & quantity price rules')} id="pf-rules">
      {product.priceRules.length ? (
        <ul className="mb-4 flex flex-col gap-2">
          {product.priceRules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line-soft bg-surface px-3 py-2.5 text-sm">
              <span>{groupName(rule.customerGroupId)}{sep}{l('تعداد', 'Qty')} <Num value={rule.minQty} />–{rule.maxQty == null ? '∞' : <Num value={rule.maxQty} />}{sep}<Money value={rule.base} />{rule.manualIrr ? <>{sep}{l('ریال دستی', 'Manual IRR')}: <Money value={{ currency: 'IRR', amountMinor: rule.manualIrr }} /></> : null}</span>
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
        <Field id="pr-min" label={l('از تعداد', 'Min qty')}><Input id="pr-min" inputMode="numeric" value={r.minQty} onChange={(e) => setR({ ...r, minQty: e.target.value })} /></Field>
        <Field id="pr-max" label={l('تا تعداد', 'Max qty')} optionalLabel={t('common.optional')}><Input id="pr-max" inputMode="numeric" value={r.maxQty} onChange={(e) => setR({ ...r, maxQty: e.target.value })} /></Field>
        <Field id="pr-cur" label={l('ارز', 'Currency')}>
          <Select id="pr-cur" value={r.currency} onChange={(e) => setR({ ...r, currency: e.target.value as 'IRR' | 'AED' })}><option value="IRR">IRR</option><option value="AED">AED</option></Select>
        </Field>
        <Field id="pr-price" label={t('admin.price')}><Input id="pr-price" dir="ltr" value={r.price} onChange={(e) => setR({ ...r, price: e.target.value })} /></Field>
        <Field id="pr-irr" label={l('ریال دستی', 'Manual IRR')} optionalLabel={t('common.optional')}><Input id="pr-irr" dir="ltr" value={r.manualIrr} onChange={(e) => setR({ ...r, manualIrr: e.target.value })} /></Field>
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      <Button className="mt-3" variant="secondary" onClick={() => void add()}>{t('common.add')}</Button>
    </Section>
  );
}
