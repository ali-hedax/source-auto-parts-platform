'use client';

import { Suspense } from 'react';
import { StaffPage } from '@/components/admin/staff-page';

export default function Page() {
  return (
    <Suspense>
      <StaffPage />
    </Suspense>
  );
}
