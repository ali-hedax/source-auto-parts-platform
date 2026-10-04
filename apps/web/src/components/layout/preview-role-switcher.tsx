'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

/** Stores the preview role read by the fixture handler (preview mode only). */
function setPreviewRole(role: string): void {
  document.cookie = `hedax_fixture_role=${role}; path=/; samesite=lax`;
}

/** Preview-only helper to look at the customer and admin areas with sample data. */
export function PreviewRoleSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const set = (role: string) => {
    setPreviewRole(role);
    router.refresh();
  };
  const label = locale === 'fa' ? { as: 'نمایش به‌عنوان:', guest: 'مهمان', customer: 'مشتری', staff: 'مالک' } : { as: 'Preview as:', guest: 'Guest', customer: 'Customer', staff: 'Owner' };
  return (
    <span className="flex items-center gap-1">
      <span>{label.as}</span>
      {(['guest', 'customer', 'staff'] as const).map((r) => (
        <button key={r} type="button" onClick={() => set(r === 'guest' ? '' : r)} className="min-h-9 cursor-pointer rounded px-2 underline underline-offset-2 hover:bg-white/60">
          {label[r]}
        </button>
      ))}
    </span>
  );
}
