'use client';

import { localize } from '@hedax/contracts/constants';
import { useLocale } from 'next-intl';
import { Async } from '@/components/ui/async';
import { Field, Select } from '@/components/ui/field';
import { Section } from '@/components/ui/misc';
import { AnnouncementBarView } from '@/components/layout/announcement-bar-view';
import { useL } from '../shell';
import { ContentFrame, ContentHistory, LinkField, LocalizedField, SaveBar, ToggleField, useContentSection } from './kit';

/** A short message above every page (e.g. a holiday or a shipping notice), with an optional link. */
export function ContentAnnouncementPage() {
  const l = useL();
  const locale = useLocale();
  const s = useContentSection('announcement');
  const names = { enabled: l('روشن/خاموش', 'On/off'), text: l('متن', 'Text'), linkLabel: l('متن لینک', 'Link text'), href: l('لینک', 'Link'), tone: l('رنگ', 'Colour') };
  return (
    <ContentFrame title={l('نوار اطلاع‌رسانی', 'Notice bar')} description={l('پیام کوتاهی که بالای همهٔ صفحه‌های سایت نمایش داده می‌شود.', 'A short message shown above every page of the site.')}>
      <Async state={s.state}>
        {() => {
          const d = s.draft;
          if (!d) return null;
          return (
            <>
              <Section title={l('پیام', 'Message')}>
                <div className="flex flex-col gap-5">
                  <ToggleField id="a-on" label={l('نوار روی سایت نمایش داده شود', 'Show the bar on the site')} checked={d.enabled} onChange={(v) => s.update({ enabled: v })} />
                  <LocalizedField id="a-text" path="text" label={names.text} required={d.enabled} maxLength={200} value={d.text} onChange={(v) => s.update({ text: v })} errors={s.errors} />
                  <LocalizedField id="a-label" path="linkLabel" label={names.linkLabel} maxLength={40} value={d.linkLabel} onChange={(v) => s.update({ linkLabel: v })} errors={s.errors} hint={l('اختیاری؛ مثل «جزئیات»', 'Optional, e.g. "Details"')} />
                  <LinkField id="a-href" label={names.href} value={d.href} onChange={(v) => s.update({ href: v })} error={s.errors.href} />
                  <Field id="a-tone" label={names.tone}>
                    <Select id="a-tone" value={d.tone} onChange={(e) => s.update({ tone: e.target.value as typeof d.tone })}>
                      <option value="brand">{l('آبی سورس', 'Source blue')}</option>
                      <option value="info">{l('روشن', 'Light')}</option>
                      <option value="warning">{l('هشدار (زرد)', 'Warning (amber)')}</option>
                    </Select>
                  </Field>
                </div>
              </Section>
              <Section title={l('پیش‌نمایش', 'Preview')}>
                {d.text.fa ? <AnnouncementBarView text={localize(d.text, locale)} linkLabel={localize(d.linkLabel, locale)} href={d.href} tone={d.tone} /> : <p className="text-sm text-steel">{l('متن را بنویسید تا پیش‌نمایش را ببینید.', 'Write the text to see a preview.')}</p>}
              </Section>
              <SaveBar busy={s.busy} onSave={() => void s.save()} status={s.status} />
              <ContentHistory entityType="content" entityId="announcement" refreshKey={s.saved} fieldNames={names} />
            </>
          );
        }}
      </Async>
    </ContentFrame>
  );
}
