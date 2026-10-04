'use client';

import { Suspense } from 'react';
import { ReportsPage } from '@/components/admin/finance';

export default function Page() {
  return (
    <Suspense>
      <ReportsPage />
    </Suspense>
  );
}
