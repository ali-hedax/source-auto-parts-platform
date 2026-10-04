'use client';

import { Suspense } from 'react';
import { ImportsPage } from '@/components/admin/catalog-ops';

export default function Page() {
  return (
    <Suspense>
      <ImportsPage />
    </Suspense>
  );
}
