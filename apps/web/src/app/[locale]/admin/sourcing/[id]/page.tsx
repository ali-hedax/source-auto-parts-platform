'use client';

import { Suspense } from 'react';
import { SourcingWorkbench } from '@/components/admin/sourcing';

export default function Page() {
  return (
    <Suspense>
      <SourcingWorkbench />
    </Suspense>
  );
}
