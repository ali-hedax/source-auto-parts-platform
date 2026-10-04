'use client';

import { Suspense } from 'react';
import { QuotesList } from '@/components/admin/sourcing';

export default function Page() {
  return (
    <Suspense>
      <QuotesList />
    </Suspense>
  );
}
