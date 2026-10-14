'use client';

import { Suspense } from 'react';
import { ContentSeoPage } from '@/components/admin/content/seo';

export default function Page() {
  return (
    <Suspense>
      <ContentSeoPage />
    </Suspense>
  );
}
