'use client';

import { Suspense } from 'react';
import { AccountPage } from '@/components/admin/account';

export default function Page() {
  return (
    <Suspense>
      <AccountPage />
    </Suspense>
  );
}
