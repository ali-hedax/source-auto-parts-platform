'use client';

import { Suspense } from 'react';
import { ProductEditorPage } from '@/components/admin/products';

export default function Page() {
  return (
    <Suspense>
      <ProductEditorPage />
    </Suspense>
  );
}
