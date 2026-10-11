'use client';

import { Suspense } from 'react';
import { ImportsPage } from '@/components/admin/imports';

export default function Page() {
  return (
    <Suspense>
      <ImportsPage />
    </Suspense>
  );
}
