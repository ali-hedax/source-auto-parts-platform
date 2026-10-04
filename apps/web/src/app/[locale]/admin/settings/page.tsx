'use client';

import { Suspense } from 'react';
import { SiteSettingsPage } from '@/components/admin/settings';

export default function Page() {
  return (
    <Suspense>
      <SiteSettingsPage />
    </Suspense>
  );
}
