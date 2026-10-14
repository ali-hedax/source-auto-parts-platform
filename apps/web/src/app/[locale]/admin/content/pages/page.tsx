'use client';

import { Suspense } from 'react';
import { ContentPagesPage } from '@/components/admin/content/pages';

export default function Page() {
  return (
    <Suspense>
      <ContentPagesPage />
    </Suspense>
  );
}
