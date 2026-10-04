'use client';

import { Suspense } from 'react';
import { AdminOrderPage } from '@/components/admin/fulfilment';

export default function Page() {
  return (
    <Suspense>
      <AdminOrderPage />
    </Suspense>
  );
}
