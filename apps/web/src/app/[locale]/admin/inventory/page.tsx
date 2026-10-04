'use client';

import { Suspense } from 'react';
import { InventoryPage } from '@/components/admin/catalog-ops';

export default function Page() {
  return (
    <Suspense>
      <InventoryPage />
    </Suspense>
  );
}
