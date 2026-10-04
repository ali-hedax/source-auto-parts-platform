'use client';

import { Suspense } from 'react';
import { FxPage } from '@/components/admin/settings';

export default function Page() {
  return (
    <Suspense>
      <FxPage />
    </Suspense>
  );
}
