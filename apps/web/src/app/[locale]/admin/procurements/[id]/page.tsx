'use client';

import { Suspense } from 'react';
import { AdminProcurementPage } from '@/components/admin/fulfilment';

export default function Page() {
  return (
    <Suspense>
      <AdminProcurementPage />
    </Suspense>
  );
}
