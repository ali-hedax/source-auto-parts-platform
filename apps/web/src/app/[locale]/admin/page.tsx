'use client';

import { Suspense } from 'react';
import { AdminDashboard } from '@/components/admin/dashboard';

export default function Page() {
  return (
    <Suspense>
      <AdminDashboard />
    </Suspense>
  );
}
