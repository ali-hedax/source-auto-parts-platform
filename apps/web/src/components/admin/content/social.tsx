'use client';

import { SOCIAL_NETWORKS, type SocialNetwork } from '@hedax/contracts/constants';
import { Plus, Trash2 } from 'lucide-react';
import { Async } from '@/components/ui/async';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Section } from '@/components/ui/misc';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, LocalizedField, MoveButtons, SaveBar, TextField, ToggleField, moveItem, useContentSection } from './kit';

export function useNetworkName() {
  const l = useL();
  return (n: SocialNetwork) => ({
    instagram: l('اینستاگرام', 'Instagram'), linkedin: l('لینکدین', 'LinkedIn'), telegram: l('تلگرام', 'Telegram'), x: l('ایکس (توییتر)', 'X (Twitter)'),
    whatsapp: l('واتس‌اپ', 'WhatsApp'), youtube: l('یوتیوب', 'YouTube'), aparat: l('آپارات', 'Aparat'), other: l('سایر', 'Other'),
  })[n];
}

/** Links to the business's profiles; shown in the footer when an address is set. */
export function ContentSocialPage() {
  const l = useL();
  const name = useNetworkName();
  const s = useContentSection('social');
  return (
    <ContentFrame title={l('شبکه‌های اجتماعی', 'Social networks')} description={l('برای هر شبکه نشانی کامل صفحه را وارد کنید. ردیفی که نشانی ندارد یا مخفی است روی سایت نمایش داده نمی‌شود.', 'Enter the full profile address. Rows without an address, or hidden ones, are not shown.')}>
      <Async state={s.state}>
        {() => {
          const d = s.draft;
          if (!d) return null;
          const set = (i: number, patch: Partial<(typeof d.links)[number]>) => s.update({ links: d.links.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <>
              <Section title={l('پیوندها', 'Links')} actions={<Button size="sm" variant="secondary" disabled={d.links.length >= 16} onClick={() => s.update({ links: [...d.links, { network: 'other', label: { fa: '', en: '' }, url: '', visible: true }] })}><Plus aria-hidden className="size-4" /> {l('افزودن مورد جدید', 'Add new')}</Button>}>
                <ol className="flex flex-col gap-4">
                  {d.links.map((x, i) => (
                    <li key={i} className="rounded-[var(--radius-card)] border border-line-soft p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="font-semibold">{x.network === 'other' ? (x.label.fa || name('other')) : name(x.network)}</span>
                        <div className="flex gap-1">
                          <MoveButtons index={i} count={d.links.length} name={name(x.network)} onMove={(a, b) => s.update({ links: moveItem(d.links, a, b) })} />
                          <Button size="sm" variant="ghost" className="text-danger" aria-label={l('حذف', 'Remove')} onClick={() => s.update({ links: d.links.filter((_, j) => j !== i) })}><Trash2 aria-hidden className="size-4" /></Button>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
                        <Field id={`s${i}-net`} label={l('شبکه', 'Network')}>
                          <Select id={`s${i}-net`} value={x.network} onChange={(e) => set(i, { network: e.target.value as SocialNetwork })}>
                            {SOCIAL_NETWORKS.map((n) => <option key={n} value={n}>{name(n)}</option>)}
                          </Select>
                        </Field>
                        <TextField id={`s${i}-url`} label={l('نشانی صفحه', 'Profile address')} ltr inputMode="url" placeholder="https://instagram.com/…" value={x.url} onChange={(v) => set(i, { url: v })} error={s.errors[`links.${i}.url`]} />
                      </div>
                      {x.network === 'other' ? <div className="mt-4"><LocalizedField id={`s${i}-label`} path={`links.${i}.label`} label={l('نام نمایشی', 'Display name')} maxLength={40} value={x.label} onChange={(v) => set(i, { label: v })} errors={s.errors} /></div> : null}
                      <div className="mt-3"><ToggleField id={`s${i}-vis`} label={l('نمایش در سایت', 'Show on the site')} checked={x.visible} onChange={(v) => set(i, { visible: v })} /></div>
                    </li>
                  ))}
                </ol>
              </Section>
              <SaveBar busy={s.busy} onSave={() => void s.save()} status={s.status} />
              <ContentHistory entityType="content" entityId="social" refreshKey={s.saved} />
            </>
          );
        }}
      </Async>
    </ContentFrame>
  );
}
