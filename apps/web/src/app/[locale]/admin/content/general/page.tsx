'use client';

import { Suspense } from 'react';
import { ContentGeneralPage } from '@/components/admin/content/general';

export default function Page() {
  return (
    <Suspense>
      <ContentGeneralPage />
    </Suspense>
  );
}
