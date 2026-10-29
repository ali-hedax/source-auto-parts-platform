'use client';

import type { ContactChannels, ContactContent, ContactPhone } from '@hedax/contracts';
import { resolveContactChannels } from '@hedax/contracts/constants';
import { useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/misc';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, LocalizedField, MoveButtons, SaveBar, TextField, ToggleField, moveItem, useContentSection } from './kit';

const EMPTY_CONTACT_CHANNELS: ContactChannels = { phone: '', phoneExtension: '', mobile: '', whatsapp: '', telegram: '', bale: '', instagram: '' };
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
              <ChannelsSection draft={d} social={s.state.data?.social.value.links ?? []} update={(channels) => s.update({ channels })} errors={s.errors} />
              <details className="rounded-[var(--radius-card)] border border-line-soft p-4">
                <summary className="cursor-pointer font-semibold">{l('شماره‌های دیگر (پیشرفته، اختیاری)', 'Other numbers (advanced, optional)')}</summary>
                <p className="mt-2 text-sm text-steel">{l('فوتر و صفحهٔ تماس از بخش «راه‌های تماس» بالا استفاده می‌کنند. این فهرست فقط برای سازگاری با تنظیمات قدیمی است.', 'The footer and contact page use «Contact channels» above. This list is kept for older settings only.')}</p>
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
              </details>
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

/**
 * Footer contact channels, each in its own field and shown in this order. On first open, settings
 * saved before these fields existed are filled in from the old phone list (save to keep them).
 */
function ChannelsSection({ draft, social, update, errors }: { draft: ContactContent; social: Array<{ network: string; url: string }>; update: (c: ContactChannels) => void; errors: Record<string, string> }) {
  const l = useL();
  // Settings saved before the channels existed may not carry them yet.
  const c = draft.channels ?? EMPTY_CONTACT_CHANNELS;
  const empty = Object.values(c).every((v) => v.trim() === '');
  useEffect(() => {
    if (!empty) return;
    const derived = resolveContactChannels({ phones: draft.phones }, social);
    if (Object.values(derived).some((v) => v)) update(derived);
    // Only once, when the section first shows empty channels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (patch: Partial<ContactChannels>) => update({ ...c, ...patch });
  const err = (k: keyof ContactChannels) => errors[`channels.${k}`];
  return (
    <Section title={l('راه‌های تماس (فوتر و صفحهٔ تماس)', 'Contact channels (footer and contact page)')}>
      <p className="mb-4 text-sm text-steel">{l('به همین ترتیب در فوتر نمایش داده می‌شوند: تلفن، موبایل، واتس‌اپ، تلگرام، بله، اینستاگرام. هر موردی خالی بماند نمایش داده نمی‌شود. بعد از تغییر «ذخیره» را بزنید.', 'Shown in the footer in this order: phone, mobile, WhatsApp, Telegram, Bale, Instagram. Empty ones are hidden. Save after editing.')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <TextField id="ch-phone" label={l('تلفن ثابت', 'Landline')} ltr inputMode="tel" placeholder="025 3666 8006" value={c.phone} onChange={(v) => set({ phone: v })} error={err('phone')} />
          <TextField id="ch-ext" label={l('داخلی', 'Extension')} ltr inputMode="numeric" maxLength={6} value={c.phoneExtension} onChange={(v) => set({ phoneExtension: v })} error={err('phoneExtension')} />
        </div>
        <TextField id="ch-mobile" label={l('موبایل', 'Mobile')} ltr inputMode="tel" placeholder="0912 153 1797" value={c.mobile} onChange={(v) => set({ mobile: v })} error={err('mobile')} />
        <TextField id="ch-whatsapp" label={l('واتس‌اپ (شماره)', 'WhatsApp (number)')} ltr inputMode="tel" placeholder="+971 50 144 1797" value={c.whatsapp} onChange={(v) => set({ whatsapp: v })} error={err('whatsapp')} hint={l('با کد کشور؛ لینک گفت‌وگو خودکار ساخته می‌شود.', 'With country code; the chat link is built automatically.')} />
        <TextField id="ch-telegram" label={l('تلگرام', 'Telegram')} ltr placeholder="@sourcebyhedax" value={c.telegram} onChange={(v) => set({ telegram: v })} error={err('telegram')} hint={l('نام کاربری یا لینک t.me', 'Username or t.me link')} />
        <TextField id="ch-bale" label={l('بله', 'Bale')} ltr placeholder="@sourcebyhedax" value={c.bale} onChange={(v) => set({ bale: v })} error={err('bale')} hint={l('نام کاربری یا لینک ble.ir', 'Username or ble.ir link')} />
        <TextField id="ch-instagram" label={l('اینستاگرام', 'Instagram')} ltr placeholder="@hedax.73" value={c.instagram} onChange={(v) => set({ instagram: v })} error={err('instagram')} hint={l('نام کاربری یا لینک instagram.com', 'Username or instagram.com link')} />
      </div>
    </Section>
  );
}
