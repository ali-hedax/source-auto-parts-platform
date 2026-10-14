'use client';

import type { ContactPhone } from '@hedax/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/misc';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, LocalizedField, MoveButtons, SaveBar, TextField, ToggleField, moveItem, useContentSection } from './kit';

const emptyPhone: ContactPhone = { label: { fa: '', en: '' }, number: '', numberFa: '', extension: '', whatsapp: false };

/** Phones (any number, each optionally on WhatsApp), e-mail, address, map location and hours. */
export function ContentContactPage() {
  const l = useL();
  const s = useContentSection('contact');
  const names = { displayName: l('نام کسب‌وکار', 'Business name'), phones: l('تلفن‌ها', 'Phones'), email: l('ایمیل', 'E-mail'), address: l('نشانی', 'Address'), mapUrl: l('لینک نقشه', 'Map link'), mapLat: l('عرض جغرافیایی', 'Latitude'), mapLng: l('طول جغرافیایی', 'Longitude'), hours: l('ساعت کاری', 'Hours'), supportChat: l('گفت‌وگوی پشتیبانی', 'Support chat') };
  return (
    <ContentFrame title={l('اطلاعات تماس', 'Contact details')} description={l('در پایین همهٔ صفحه‌ها و صفحهٔ «تماس با ما» نمایش داده می‌شود. موردی که خالی بماند نمایش داده نمی‌شود.', 'Shown in the footer and on the contact page. Empty items are not shown.')}>
      <Async state={s.state}>
        {() => {
          const d = s.draft;
          if (!d) return null;
          const setPhone = (i: number, patch: Partial<ContactPhone>) => s.update({ phones: d.phones.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
          const num = (v: string) => (v.trim() === '' ? null : Number(v));
          return (
            <>
              <Section title={names.phones} actions={<Button size="sm" variant="secondary" disabled={d.phones.length >= 8} onClick={() => s.update({ phones: [...d.phones, emptyPhone] })}><Plus aria-hidden className="size-4" /> {l('افزودن شماره', 'Add number')}</Button>}>
                {d.phones.length ? (
                  <ol className="flex flex-col gap-4">
                    {d.phones.map((p, i) => (
                      <li key={i} className="rounded-[var(--radius-card)] border border-line-soft p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="font-semibold">{p.label.fa || l(`شمارهٔ ${i + 1}`, `Number ${i + 1}`)}</span>
                          <div className="flex gap-1">
                            <MoveButtons index={i} count={d.phones.length} name={p.label.fa || String(i + 1)} onMove={(a, b) => s.update({ phones: moveItem(d.phones, a, b) })} />
                            <Button size="sm" variant="ghost" className="text-danger" aria-label={l('حذف این شماره', 'Remove this number')} onClick={() => s.update({ phones: d.phones.filter((_, j) => j !== i) })}><Trash2 aria-hidden className="size-4" /></Button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-4">
                          <LocalizedField id={`p${i}-label`} path={`phones.${i}.label`} label={l('عنوان', 'Label')} required maxLength={60} value={p.label} onChange={(v) => setPhone(i, { label: v })} errors={s.errors} hint={l('مثل «تلفن» یا «موبایل و واتس‌اپ (امارات)»', 'e.g. "Phone" or "Mobile & WhatsApp (UAE)"')} />
                          <div className="grid gap-4 sm:grid-cols-3">
                            <TextField id={`p${i}-number`} label={l('شماره (با کد کشور)', 'Number (with country code)')} required ltr inputMode="tel" placeholder="+98 25 3666 6669" value={p.number} onChange={(v) => setPhone(i, { number: v })} error={s.errors[`phones.${i}.number`]} />
                            <TextField id={`p${i}-fa`} label={l('نوشتن فارسی (اختیاری)', 'Persian form (optional)')} ltr placeholder="۰۲۵-۳۶۶۶۶۶۶۹" value={p.numberFa} onChange={(v) => setPhone(i, { numberFa: v })} error={s.errors[`phones.${i}.numberFa`]} hint={l('اگر خالی بماند، همان شماره با رقم فارسی', 'Empty = the number in Persian digits')} />
                            <TextField id={`p${i}-ext`} label={l('داخلی (اختیاری)', 'Extension (optional)')} ltr inputMode="numeric" maxLength={6} value={p.extension} onChange={(v) => setPhone(i, { extension: v })} error={s.errors[`phones.${i}.extension`]} />
                          </div>
                          <ToggleField id={`p${i}-wa`} label={l('این شماره واتس‌اپ دارد (لینک «گفت‌وگو در واتس‌اپ» نمایش داده شود)', 'This number is on WhatsApp (show a WhatsApp link)')} checked={p.whatsapp} onChange={(v) => setPhone(i, { whatsapp: v })} />
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-steel">{l('هنوز شماره‌ای ثبت نشده است.', 'No number yet.')}</p>}
              </Section>
              <Section title={l('ایمیل، نشانی و ساعت کاری', 'E-mail, address and hours')}>
                <div className="flex flex-col gap-5">
                  <TextField id="c-name" label={names.displayName} ltr maxLength={80} value={d.displayName} onChange={(v) => s.update({ displayName: v })} error={s.errors.displayName} hint={l('بالای اطلاعات در صفحهٔ «تماس با ما».', 'Above the details on the contact page.')} />
                  <TextField id="c-email" type="email" label={names.email} ltr inputMode="email" placeholder="info@example.com" value={d.email} onChange={(v) => s.update({ email: v })} error={s.errors.email} />
                  <LocalizedField id="c-address" path="address" label={names.address} multiline rows={2} maxLength={300} value={d.address} onChange={(v) => s.update({ address: v })} errors={s.errors} />
                  <LocalizedField id="c-hours" path="hours" label={names.hours} maxLength={200} value={d.hours} onChange={(v) => s.update({ hours: v })} errors={s.errors} hint={l('مثل «شنبه تا پنجشنبه، ۹ تا ۱۸»', 'e.g. "Saturday to Thursday, 9:00–18:00"')} />
                </div>
              </Section>
              <Section title={l('لوکیشن روی نقشه', 'Map location')}>
                <div className="flex flex-col gap-5">
                  <TextField id="c-map" label={names.mapUrl} ltr inputMode="url" placeholder="https://maps.google.com/…" value={d.mapUrl} onChange={(v) => s.update({ mapUrl: v })} error={s.errors.mapUrl} hint={l('لینک «اشتراک‌گذاری» از گوگل‌مپ، نشان یا بلد. یا مختصات را وارد کنید.', 'A share link from Google Maps, Neshan or Balad — or enter the coordinates.')} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField id="c-lat" label={names.mapLat} ltr inputMode="decimal" placeholder="34.6416" value={d.mapLat === null ? '' : String(d.mapLat)} onChange={(v) => s.update({ mapLat: num(v) })} error={s.errors.mapLat} />
                    <TextField id="c-lng" label={names.mapLng} ltr inputMode="decimal" placeholder="50.8746" value={d.mapLng === null ? '' : String(d.mapLng)} onChange={(v) => s.update({ mapLng: num(v) })} error={s.errors.mapLng} />
                  </div>
                </div>
              </Section>
              <Section title={names.supportChat}>
                <ToggleField id="c-chat" label={l('متن و دکمهٔ گفت‌وگوی پشتیبانی در صفحهٔ تماس نمایش داده شود', 'Show the support chat text and button on the contact page')} checked={d.supportChat} onChange={(v) => s.update({ supportChat: v })} hint={l('گفت‌وگو به ورود مشتری با پیامک نیاز دارد؛ تا فعال شدن پیامک خاموش بماند.', 'The chat needs customer SMS sign-in; keep it off until SMS works.')} />
              </Section>
              <SaveBar busy={s.busy} onSave={() => void s.save()} status={s.status} />
              <ContentHistory entityType="content" entityId="contact" refreshKey={s.saved} fieldNames={names} />
            </>
          );
        }}
      </Async>
    </ContentFrame>
  );
}
