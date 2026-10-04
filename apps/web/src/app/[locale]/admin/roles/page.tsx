'use client';

import { Suspense } from 'react';
import { RolesPage } from '@/components/admin/people';

export default function Page() {
  return (
    <Suspense>
      <RolesPage />
    </Suspense>
  );
}
