'use client';

import { Suspense } from 'react';
import { TaxonomyPage } from '@/components/admin/catalog-ops';

export default function Page() {
  return (
    <Suspense>
      <TaxonomyPage />
    </Suspense>
  );
}
