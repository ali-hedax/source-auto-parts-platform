'use client';

import { Suspense } from 'react';
import { ContentHomePage } from '@/components/admin/content/home';

export default function Page() {
  return (
    <Suspense>
      <ContentHomePage />
    </Suspense>
  );
}
