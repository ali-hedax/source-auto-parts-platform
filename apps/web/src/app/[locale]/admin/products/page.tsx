'use client';

import { Suspense } from 'react';
import { ProductsList } from '@/components/admin/products';

export default function Page() {
  return (
    <Suspense>
      <ProductsList />
    </Suspense>
  );
}
