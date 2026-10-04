'use client';

import { Suspense } from 'react';
import { AdminReturnsPage } from '@/components/admin/finance';

export default function Page() {
  return (
    <Suspense>
      <AdminReturnsPage />
    </Suspense>
  );
}
