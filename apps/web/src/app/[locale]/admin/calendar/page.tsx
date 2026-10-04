'use client';

import { Suspense } from 'react';
import { CalendarPage } from '@/components/admin/settings';

export default function Page() {
  return (
    <Suspense>
      <CalendarPage />
    </Suspense>
  );
}
