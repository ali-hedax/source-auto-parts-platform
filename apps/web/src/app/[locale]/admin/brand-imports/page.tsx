'use client';

import { Suspense } from 'react';
import { BrandImportsPage } from '@/components/admin/brand-imports';

export default function Page() {
  return (
    <Suspense>
      <BrandImportsPage />
    </Suspense>
  );
}
