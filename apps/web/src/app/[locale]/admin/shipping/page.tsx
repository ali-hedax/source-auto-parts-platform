'use client';

import { Suspense } from 'react';
import { ShippingPage } from '@/components/admin/settings';

export default function Page() {
  return (
    <Suspense>
      <ShippingPage />
    </Suspense>
  );
}
