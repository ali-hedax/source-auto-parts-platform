'use client';

import { Suspense } from 'react';
import { PaymentsPage } from '@/components/admin/finance';

export default function Page() {
  return (
    <Suspense>
      <PaymentsPage />
    </Suspense>
  );
}
