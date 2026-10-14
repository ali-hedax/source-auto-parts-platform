'use client';

import type { ContentButton, HomeSection, HomeSectionType } from '@hedax/contracts';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Badge, Section } from '@/components/ui/misc';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, type FieldErrors, ImageField, LinkField, LocalizedField, MoveButtons, SaveBar, ToggleField, moveItem, useContentSection } from './kit';

const blank = { fa: '', en: '' };

function ButtonFields({ id, path, value, onChange, errors, label }: { id: string; path: string; value: ContentButton; onChange: (v: ContentButton) => void; errors: FieldErrors; label: string }) {
  const l = useL();
  return (
    <fieldset className="rounded-[var(--radius-control)] border border-line-soft p-3">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="flex flex-col gap-4">
        <LocalizedField id={`${id}-label`} path={`${path}.label`} label={l('متن دکمه', 'Button text')} maxLength={60} value={value.label} onChange={(v) => onChange({ ...value, label: v })} errors={errors} hint={l('خالی = دکمه نمایش داده نمی‌شود.', 'Empty = no button.')} />
        <LinkField id={`${id}-href`} label={l('لینک دکمه', 'Button link')} value={value.href} onChange={(v) => onChange({ ...value, href: v })} error={errors[`${path}.href`]} />
      </div>
    </fieldset>
  );
}

/** Editor for one section, by type. `path` is where its fields are in the saved value (for errors). */
function SectionEditor({ section, onChange, errors, path }: { section: HomeSection; onChange: (s: HomeSection) => void; errors: FieldErrors; path: string }) {
  const l = useL();
  const id = `h-${section.id}`;
  switch (section.type) {
    case 'hero': {
      const s = section;
      return (
        <div className="flex flex-col gap-5">
          <LocalizedField id={`${id}-title`} path={`${path}.title`} label={l('عنوان اصلی', 'Headline')} required multiline rows={2} maxLength={160} value={s.title} onChange={(v) => onChange({ ...s, title: v })} errors={errors} />
          <LocalizedField id={`${id}-text`} path={`${path}.text`} label={l('زیرعنوان', 'Subheading')} multiline rows={3} maxLength={500} value={s.text} onChange={(v) => onChange({ ...s, text: v })} errors={errors} />
          <LocalizedField id={`${id}-search`} path={`${path}.searchButton`} label={l('متن دکمهٔ جست‌وجو', 'Search button text')} required maxLength={40} value={s.searchButton} onChange={(v) => onChange({ ...s, searchButton: v })} errors={errors} />
          <ImageField id={`${id}-img`} label={l('تصویر پس‌زمینه (اختیاری)', 'Background image (optional)')} value={s.imageUrl} onChange={(v) => onChange({ ...s, imageUrl: v })} error={errors[`${path}.imageUrl`]} hint={l('با لایهٔ تیره پشت متن قرار می‌گیرد تا متن خوانا بماند.', 'Placed behind the text under a dark layer so the text stays readable.')} />
          <ToggleField id={`${id}-cats`} label={l('نمایش دسته‌بندی‌ها زیر جست‌وجو', 'Show categories under the search')} checked={s.showCategories} onChange={(v) => onChange({ ...s, showCategories: v })} />
          {s.showCategories ? <LocalizedField id={`${id}-cats-t`} path={`${path}.categoriesTitle`} label={l('عنوان دسته‌بندی‌ها', 'Categories title')} maxLength={80} value={s.categoriesTitle} onChange={(v) => onChange({ ...s, categoriesTitle: v })} errors={errors} /> : null}
          <ToggleField id={`${id}-proc`} label={l('نمایش کادر «فرایند تأمین سفارشی»', 'Show the sourcing process box')} checked={s.showProcess} onChange={(v) => onChange({ ...s, showProcess: v })} />
          {s.showProcess ? (
            <div className="flex flex-col gap-5 rounded-[var(--radius-control)] border border-line-soft p-3">
              <LocalizedField id={`${id}-proc-t`} path={`${path}.processTitle`} label={l('عنوان کادر', 'Box title')} maxLength={80} value={s.processTitle} onChange={(v) => onChange({ ...s, processTitle: v })} errors={errors} />
              <ol className="flex flex-col gap-4">
                {s.steps.map((step, i) => (
                  <li key={i} className="rounded-[var(--radius-control)] bg-surface p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{l(`مرحلهٔ ${i + 1}`, `Step ${i + 1}`)}</span>
                      <div className="flex gap-1">
                        <MoveButtons index={i} count={s.steps.length} name={step.title.fa || String(i + 1)} onMove={(a, b) => onChange({ ...s, steps: moveItem(s.steps, a, b) })} />
                        <Button size="sm" variant="ghost" className="text-danger" aria-label={l('حذف مرحله', 'Remove step')} onClick={() => onChange({ ...s, steps: s.steps.filter((_, j) => j !== i) })}><Trash2 aria-hidden className="size-4" /></Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-4">
                      <LocalizedField id={`${id}-st${i}-t`} path={`${path}.steps.${i}.title`} label={l('عنوان مرحله', 'Step title')} required maxLength={80} value={step.title} onChange={(v) => onChange({ ...s, steps: s.steps.map((x, j) => (j === i ? { ...x, title: v } : x)) })} errors={errors} />
                      <LocalizedField id={`${id}-st${i}-x`} path={`${path}.steps.${i}.text`} label={l('توضیح', 'Text')} multiline rows={2} maxLength={300} value={step.text} onChange={(v) => onChange({ ...s, steps: s.steps.map((x, j) => (j === i ? { ...x, text: v } : x)) })} errors={errors} />
                    </div>
                  </li>
                ))}
              </ol>
              <Button size="sm" variant="secondary" className="self-start" disabled={s.steps.length >= 8} onClick={() => onChange({ ...s, steps: [...s.steps, { title: blank, text: blank }] })}><Plus aria-hidden className="size-4" /> {l('افزودن مرحله', 'Add step')}</Button>
              <ButtonFields id={`${id}-pb`} path={`${path}.processButton`} label={l('دکمهٔ زیر مراحل', 'Button under the steps')} value={s.processButton} onChange={(v) => onChange({ ...s, processButton: v })} errors={errors} />
            </div>
          ) : null}
        </div>
      );
    }
    case 'brands': {
      const s = section;
      return (
        <div className="flex flex-col gap-5">
          <LocalizedField id={`${id}-title`} path={`${path}.title`} label={l('عنوان بخش', 'Section title')} maxLength={80} value={s.title} onChange={(v) => onChange({ ...s, title: v })} errors={errors} />
          <p className="text-sm text-steel">{l('خود برندها از بخش «برندها» در کاتالوگ می‌آیند. کارت آخر برای «سایر برندها» است:', 'The brands come from the catalog. The last card is for other brands:')}</p>
          <LocalizedField id={`${id}-ot`} path={`${path}.otherTitle`} label={l('عنوان کارت «سایر برندها»', '"Other brands" card title')} maxLength={80} value={s.otherTitle} onChange={(v) => onChange({ ...s, otherTitle: v })} errors={errors} />
          <LocalizedField id={`${id}-ox`} path={`${path}.otherText`} label={l('توضیح کارت', 'Card text')} maxLength={160} value={s.otherText} onChange={(v) => onChange({ ...s, otherText: v })} errors={errors} />
          <LinkField id={`${id}-oh`} label={l('لینک کارت', 'Card link')} value={s.otherHref} onChange={(v) => onChange({ ...s, otherHref: v })} error={errors[`${path}.otherHref`]} />
        </div>
      );
    }
    case 'featured': {
      const s = section;
      return (
        <div className="flex flex-col gap-5">
          <LocalizedField id={`${id}-title`} path={`${path}.title`} label={l('عنوان بخش', 'Section title')} maxLength={80} value={s.title} onChange={(v) => onChange({ ...s, title: v })} errors={errors} />
          <p className="text-sm text-steel">{l('قطعه‌های این بخش خودکار از کالاهای منتشرشدهٔ موجود انتخاب می‌شوند.', 'Parts here are picked automatically from published, in-stock products.')}</p>
          <LocalizedField id={`${id}-empty`} path={`${path}.emptyText`} label={l('متن وقتی کالایی نیست', 'Text when there are no parts')} maxLength={200} value={s.emptyText} onChange={(v) => onChange({ ...s, emptyText: v })} errors={errors} />
          <ButtonFields id={`${id}-eb`} path={`${path}.emptyButton`} label={l('دکمه وقتی کالایی نیست', 'Button when there are no parts')} value={s.emptyButton} onChange={(v) => onChange({ ...s, emptyButton: v })} errors={errors} />
        </div>
      );
    }
    case 'faq': {
      const s = section;
      return (
        <div className="flex flex-col gap-3">
          <LocalizedField id={`${id}-title`} path={`${path}.title`} label={l('عنوان بخش', 'Section title')} maxLength={80} value={s.title} onChange={(v) => onChange({ ...s, title: v })} errors={errors} />
          <p className="text-sm text-steel">{l('خود پرسش‌ها در بخش «پرسش‌های متداول» ویرایش می‌شوند.', 'The questions are edited under FAQ.')}</p>
        </div>
      );
    }
    case 'text': {
      const s = section;
      return (
        <div className="flex flex-col gap-5">
          <LocalizedField id={`${id}-title`} path={`${path}.title`} label={l('عنوان', 'Title')} maxLength={120} value={s.title} onChange={(v) => onChange({ ...s, title: v })} errors={errors} />
          <LocalizedField id={`${id}-body`} path={`${path}.body`} label={l('متن', 'Text')} multiline rows={5} maxLength={4000} value={s.body} onChange={(v) => onChange({ ...s, body: v })} errors={errors} hint={l('قالب ساده: «## عنوان»، «- مورد فهرست»، **پررنگ**، [متن](لینک)', 'Simple formatting: "## heading", "- list item", **bold**, [text](link)')} />
          <ImageField id={`${id}-img`} label={l('تصویر (اختیاری)', 'Image (optional)')} value={s.imageUrl} onChange={(v) => onChange({ ...s, imageUrl: v })} error={errors[`${path}.imageUrl`]} />
          <ButtonFields id={`${id}-btn`} path={`${path}.button`} label={l('دکمه (اختیاری)', 'Button (optional)')} value={s.button} onChange={(v) => onChange({ ...s, button: v })} errors={errors} />
        </div>
      );
    }
  }
}

/** Home page: each section's texts, buttons and pictures; order and visibility. */
export function ContentHomePage() {
  const l = useL();
  const s = useContentSection('home');
  const [open, setOpen] = useState<string | null>('hero');
  const typeName: Record<HomeSectionType, string> = {
    hero: l('بخش اول (جست‌وجو و فرایند)', 'First section (search and process)'),
    brands: l('برندها', 'Brands'),
    featured: l('قطعات موجود', 'Available parts'),
    faq: l('پرسش‌های متداول', 'FAQ'),
    text: l('بلوک متن', 'Text block'),
  };
  return (
    <ContentFrame title={l('صفحهٔ اصلی', 'Home page')} description={l('ترتیب بخش‌ها را با دکمه‌های بالا/پایین عوض کنید و هر بخش را نمایش یا مخفی کنید. برای ویرایش، روی نام بخش بزنید.', 'Change the order with the up/down buttons and show or hide any section. Tap a section to edit it.')}>
      <Async state={s.state}>
        {() => {
          const d = s.draft;
          if (!d) return null;
          const sections = d.sections;
          const setAt = (i: number, next: HomeSection) => s.update({ sections: sections.map((x, j) => (j === i ? next : x)) });
          const addText = () => {
            const id = `text-${Date.now().toString(36)}`;
            s.update({ sections: [...sections, { id, type: 'text', visible: true, title: blank, body: blank, imageUrl: '', button: { label: blank, href: '' } }] });
            setOpen(id);
          };
          return (
            <>
              <ol className="flex flex-col gap-3">
                {sections.map((sec, i) => {
                  const hasError = Object.keys(s.errors).some((k) => k.startsWith(`sections.${i}.`));
                  const title = sec.type === 'text' && sec.title.fa ? `${typeName.text}: ${sec.title.fa}` : typeName[sec.type];
                  return (
                    <li key={sec.id} className={`card ${hasError ? 'border-danger' : ''}`}>
                      <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
                        <button type="button" className="min-h-11 flex-1 cursor-pointer text-start font-bold" aria-expanded={open === sec.id} onClick={() => setOpen(open === sec.id ? null : sec.id)}>
                          <span className="num me-2 text-steel">{i + 1}.</span>{title}
                        </button>
                        {sec.visible ? <Badge tone="success">{l('نمایش', 'Shown')}</Badge> : <Badge tone="neutral">{l('مخفی', 'Hidden')}</Badge>}
                        {hasError ? <Badge tone="danger">{l('نیاز به اصلاح', 'Needs fixing')}</Badge> : null}
                        <Button size="sm" variant="ghost" aria-label={sec.visible ? l(`مخفی کردن ${title}`, `Hide ${title}`) : l(`نمایش ${title}`, `Show ${title}`)} onClick={() => setAt(i, { ...sec, visible: !sec.visible })}>
                          {sec.visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                        </Button>
                        <MoveButtons index={i} count={sections.length} name={title} onMove={(a, b) => s.update({ sections: moveItem(sections, a, b) })} />
                        {sec.type === 'text' ? <Button size="sm" variant="ghost" className="text-danger" aria-label={l(`حذف ${title}`, `Remove ${title}`)} onClick={() => s.update({ sections: sections.filter((_, j) => j !== i) })}><Trash2 aria-hidden className="size-4" /></Button> : null}
                      </div>
                      {open === sec.id ? (
                        <div className="border-t border-line-soft p-3 sm:p-4">
                          <SectionEditor section={sec} onChange={(next) => setAt(i, next)} errors={s.errors} path={`sections.${i}`} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
              <Section title={l('بخش تازه', 'New section')}>
                <p className="mb-3 text-sm text-steel">{l('یک بلوک متن با عنوان، متن، تصویر و دکمه به انتهای صفحه اضافه می‌شود؛ بعد می‌توانید جایش را عوض کنید.', 'Adds a text block with title, text, image and button at the end; you can then move it.')}</p>
                <Button variant="secondary" disabled={sections.length >= 20} onClick={addText}><Plus aria-hidden className="size-4" /> {l('افزودن بلوک متن', 'Add a text block')}</Button>
              </Section>
              <SaveBar busy={s.busy} onSave={() => void s.save()} status={s.status} />
              <ContentHistory entityType="content" entityId="home" refreshKey={s.saved} />
            </>
          );
        }}
      </Async>
    </ContentFrame>
  );
}
