'use client';

import { Suspense } from 'react';
import { ContentFaqPage } from '@/components/admin/content/faq';

export default function Page() {
  return (
    <Suspense>
      <ContentFaqPage />
    </Suspense>
  );
}
