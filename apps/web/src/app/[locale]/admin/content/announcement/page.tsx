'use client';

import { Suspense } from 'react';
import { ContentAnnouncementPage } from '@/components/admin/content/announcement';

export default function Page() {
  return (
    <Suspense>
      <ContentAnnouncementPage />
    </Suspense>
  );
}
