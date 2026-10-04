'use client';

import { Suspense } from 'react';
import { SourcingList } from '@/components/admin/sourcing';

export default function Page() {
  return (
    <Suspense>
      <SourcingList />
    </Suspense>
  );
}
