'use client';

import { Suspense } from 'react';
import { AdminOrdersList } from '@/components/admin/fulfilment';

export default function Page() {
  return (
    <Suspense>
      <AdminOrdersList />
    </Suspense>
  );
}
