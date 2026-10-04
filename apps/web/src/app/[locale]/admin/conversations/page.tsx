'use client';

import { Suspense } from 'react';
import { MessagesList } from '@/components/account/detail-pages';

export default function Page() {
  return (
    <Suspense>
      <MessagesList basePath="/admin/conversations" />
    </Suspense>
  );
}
