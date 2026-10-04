'use client';

import { Suspense } from 'react';
import { PoliciesPage } from '@/components/admin/settings';

export default function Page() {
  return (
    <Suspense>
      <PoliciesPage />
    </Suspense>
  );
}
