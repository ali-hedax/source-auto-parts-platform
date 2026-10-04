'use client';

import { Suspense } from 'react';
import { CustomersPage } from '@/components/admin/people';

export default function Page() {
  return (
    <Suspense>
      <CustomersPage />
    </Suspense>
  );
}
