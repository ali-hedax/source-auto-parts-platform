'use client';

import { Suspense } from 'react';
import { AdminProcurementsList } from '@/components/admin/fulfilment';

export default function Page() {
  return (
    <Suspense>
      <AdminProcurementsList />
    </Suspense>
  );
}
