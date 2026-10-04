'use client';

import { Suspense } from 'react';
import { RefundsPage } from '@/components/admin/finance';

export default function Page() {
  return (
    <Suspense>
      <RefundsPage />
    </Suspense>
  );
}
