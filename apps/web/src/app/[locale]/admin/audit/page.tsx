'use client';

import { Suspense } from 'react';
import { AuditPage } from '@/components/admin/settings';

export default function Page() {
  return (
    <Suspense>
      <AuditPage />
    </Suspense>
  );
}
