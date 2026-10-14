'use client';

import { Suspense } from 'react';
import { ContentHubPage } from '@/components/admin/content/hub';

export default function Page() {
  return (
    <Suspense>
      <ContentHubPage />
    </Suspense>
  );
}
