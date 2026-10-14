'use client';

import { Suspense } from 'react';
import { ContentContactPage } from '@/components/admin/content/contact';

export default function Page() {
  return (
    <Suspense>
      <ContentContactPage />
    </Suspense>
  );
}
