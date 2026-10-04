'use client';

import { Suspense } from 'react';
import { StaffQuotePage } from '@/components/admin/sourcing';

export default function Page() {
  return (
    <Suspense>
      <StaffQuotePage />
    </Suspense>
  );
}
