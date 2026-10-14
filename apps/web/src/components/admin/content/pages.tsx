'use client';

import type { ContentPageInput, ContentPageView } from '@hedax/contracts';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Async } from '@/components/ui/async';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Badge, EmptyState, Ltr, Section } from '@/components/ui/misc';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { errorText, isApiError } from '@/lib/api/errors';
import { useApi } from '@/lib/use-api';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, type FieldErrors, LocalizedField, SaveBar, type Status, TextField, ToggleField, fieldErrors } from './kit';
import { RichTextEditor } from './rich-text-editor';

/** Where a page is on the site: built-in pages keep their own address. */
export function pagePath(slug: string): string {
  if (slug === 'about') return '/about';
  if (slug.startsWith('help-')) return `/help/${slug.slice(5)}`;
  return `/pages/${slug}`;
}

/** List of text pages with their state. */
export function ContentPagesPage() {
  const l = useL();
  const state = useApi<ContentPageView[]>('/admin/content/pages');
  return (
    <ContentFrame title={l('صفحه‌های متنی', 'Text pages')} description={l('«دربارهٔ ما»، مقدمهٔ صفحه‌های راهنما و هر صفحهٔ تازه‌ای که می‌سازید. قوانین و حریم خصوصی در «سیاست‌ها» با نسخه‌بندی حقوقی ویرایش می‌شوند.', 'About us, the help pages’ introductions and any new page. Terms and privacy are edited under Policies, with legal versioning.')}>
      <div><ButtonLink href="/admin/content/pages/new"><Plus aria-hidden className="size-4" /> {l('صفحهٔ تازه', 'New page')}</ButtonLink></div>
      <Async state={state}>
        {(pages) => pages.length ? (
          <ul className="flex flex-col gap-3">
            {pages.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-7">{p.title.fa}</p>
                  <p className="text-xs text-steel"><Ltr>{pagePath(p.slug)}</Ltr></p>
                </div>
                {p.published ? <Badge tone="success">{l('منتشرشده', 'Published')}</Badge> : <Badge tone="neutral">{l('پیش‌نویس', 'Draft')}</Badge>}
                {p.isSystem ? <Badge tone="info">{l('صفحهٔ سیستمی', 'Built-in')}</Badge> : null}
                {p.showInFooter ? <Badge tone="neutral">{l('در پایین صفحه', 'In footer')}</Badge> : null}
                <ButtonLink href={`/admin/content/pages/${p.id}`} size="sm" variant="secondary">{l('ویرایش', 'Edit')}</ButtonLink>
              </li>
            ))}
          </ul>
        ) : <EmptyState title={l('هنوز صفحه‌ای نیست.', 'No pages yet.')} />}
      </Async>
    </ContentFrame>
  );
}

const blank = { fa: '', en: '' };
const newPage: ContentPageInput = { slug: '', title: blank, body: blank, published: false, showInFooter: true, seoTitle: blank, seoDescription: blank };

/** Editor for one page (id = "new" creates one). */
export function ContentPageEditor({ id }: { id: string }) {
  const t = useTranslations();
  const l = useL();
  const router = useRouter();
  const isNew = id === 'new';
  const state = useApi<ContentPageView>(isNew ? null : `/admin/content/pages/${id}`);
  const [draft, setDraft] = useState<ContentPageInput | null>(isNew ? newPage : null);
  const [isSystem, setIsSystem] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (!state.data) return;
    const { id: _id, isSystem: system, sortOrder: _s, updatedAt: _u, ...rest } = state.data;
    setDraft(rest);
    setIsSystem(system);
  }, [state.data]);

  const fail = (e: unknown) => {
    const fields = isApiError(e) ? fieldErrors(e) : {};
    setErrors(fields);
    setStatus({
      tone: 'danger',
      text: Object.keys(fields).length
        ? l('چند مورد نیاز به اصلاح دارد؛ کادرهای قرمز را ببینید.', 'Some fields need fixing; see the fields marked in red.')
        : isApiError(e) && e.code === 'SLUG_IN_USE' ? l('صفحهٔ دیگری همین نشانی را دارد؛ نشانی دیگری انتخاب کنید.', 'Another page already uses this address.') : errorText(t, e),
    });
  };
  const save = async () => {
    if (!draft) return;
    setStatus(null);
    setBusy(true);
    try {
      if (isNew) {
        const created = await api<ContentPageView>('/admin/content/pages', { method: 'POST', body: draft });
        router.replace(`/admin/content/pages/${created.id}`);
        return;
      }
      await api(`/admin/content/pages/${id}`, { method: 'PUT', body: draft });
      setErrors({});
      setSaved((n) => n + 1);
      setStatus({ tone: 'success', text: draft.published ? l('ذخیره شد و روی سایت دیده می‌شود.', 'Saved; visible on the site.') : l('ذخیره شد (پیش‌نویس؛ روی سایت نیست).', 'Saved as a draft (not on the site).') });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(l('این صفحه حذف شود؟ نشانی آن دیگر کار نمی‌کند.', 'Delete this page? Its address will stop working.'))) return;
    try {
      await api(`/admin/content/pages/${id}`, { method: 'DELETE' });
      router.replace('/admin/content/pages');
    } catch (e) { fail(e); }
  };

  const body = (d: ContentPageInput) => (
    <>
      <Section title={l('متن صفحه', 'Page text')}>
        <div className="flex flex-col gap-5">
          <LocalizedField id="pg-title" path="title" label={l('عنوان', 'Title')} required maxLength={120} value={d.title} onChange={(v) => setDraft({ ...d, title: v })} errors={errors} />
          <RichTextEditor id="pg-body-fa" label={l('متن فارسی', 'Persian text')} lang="fa" maxLength={20000} value={d.body.fa} onChange={(v) => setDraft({ ...d, body: { ...d.body, fa: v } })} error={errors['body.fa']} />
          <RichTextEditor id="pg-body-en" label={l('متن انگلیسی (اگر خالی بماند، متن فارسی نمایش داده می‌شود)', 'English text (empty = the Persian text is shown)')} lang="en" maxLength={20000} value={d.body.en} onChange={(v) => setDraft({ ...d, body: { ...d.body, en: v } })} error={errors['body.en']} />
        </div>
      </Section>
      <Section title={l('نشانی و نمایش', 'Address and visibility')}>
        <div className="flex flex-col gap-5">
          {isSystem
            ? <p className="text-sm">{l('نشانی این صفحهٔ سیستمی ثابت است: ', 'This built-in page keeps its address: ')}<Ltr>{pagePath(d.slug)}</Ltr></p>
            : <TextField id="pg-slug" label={l('نشانی صفحه', 'Page address')} required ltr maxLength={60} placeholder="shipping-terms" value={d.slug} onChange={(v) => setDraft({ ...d, slug: v.toLowerCase() })} error={errors.slug} hint={l(`حروف کوچک انگلیسی، عدد و خط تیره. صفحه در ${pagePath(d.slug || 'my-page')} نمایش داده می‌شود.`, `Lower-case letters, digits and dashes. The page will be at ${pagePath(d.slug || 'my-page')}.`)} />}
          <ToggleField id="pg-pub" label={l('منتشر شود (روی سایت دیده شود)', 'Published (visible on the site)')} checked={d.published} onChange={(v) => setDraft({ ...d, published: v })} />
          {!d.slug.startsWith('help-') ? <ToggleField id="pg-foot" label={l('لینک در پایین همهٔ صفحه‌ها', 'Link in the footer of every page')} checked={d.showInFooter} onChange={(v) => setDraft({ ...d, showInFooter: v })} /> : null}
        </div>
      </Section>
      <Section title={l('سئو', 'SEO')}>
        <div className="flex flex-col gap-5">
          <LocalizedField id="pg-seo-t" path="seoTitle" label={l('عنوان برای گوگل (اختیاری)', 'Search title (optional)')} maxLength={70} value={d.seoTitle} onChange={(v) => setDraft({ ...d, seoTitle: v })} errors={errors} hint={l('خالی = عنوان صفحه.', 'Empty = the page title.')} />
          <LocalizedField id="pg-seo-d" path="seoDescription" label={l('توضیح متا', 'Meta description')} multiline rows={2} maxLength={170} value={d.seoDescription} onChange={(v) => setDraft({ ...d, seoDescription: v })} errors={errors} />
        </div>
      </Section>
      {!isNew && !isSystem ? (
        <Section title={l('حذف صفحه', 'Delete page')}>
          <Button variant="danger" onClick={() => void remove()}>{l('حذف این صفحه', 'Delete this page')}</Button>
        </Section>
      ) : null}
      <SaveBar busy={busy} onSave={() => void save()} status={status} label={isNew ? l('ساخت صفحه', 'Create page') : l('ذخیره', 'Save')} />
      {!isNew ? <ContentHistory entityType="content_page" entityId={id} refreshKey={saved} /> : null}
    </>
  );

  return (
    <ContentFrame title={isNew ? l('صفحهٔ تازه', 'New page') : l('ویرایش صفحه', 'Edit page')}>
      <ButtonLink href="/admin/content/pages" variant="ghost" size="sm" className="-mt-4 self-start">{l('همهٔ صفحه‌ها', 'All pages')}</ButtonLink>
      {isNew ? (draft ? body(draft) : null) : <Async state={state}>{() => (draft ? body(draft) : <Alert tone="info" title="…" />)}</Async>}
    </ContentFrame>
  );
}
