import { FlaskConical } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PreviewRoleSwitcher } from './preview-role-switcher';

/** Always visible in preview mode so sample data can never be mistaken for real data. */
export async function FixtureBanner() {
  const t = await getTranslations('common');
  return (
    <div role="note" className="bg-warning-soft text-warning">
      <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <FlaskConical aria-hidden className="size-4" />
          {t('sampleBanner')}
        </span>
        <PreviewRoleSwitcher />
      </div>
    </div>
  );
}
