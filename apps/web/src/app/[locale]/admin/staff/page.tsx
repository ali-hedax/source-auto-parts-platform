'use client';

import { Suspense } from 'react';
import { StaffPage } from '@/components/admin/people';

export default function Page() {
  return (
    <Suspense>
      <StaffPage />
    </Suspense>
  );
}
