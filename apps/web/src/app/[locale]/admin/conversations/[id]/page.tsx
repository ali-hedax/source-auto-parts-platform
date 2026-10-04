'use client';

import { Suspense } from 'react';
import { ConversationPage } from '@/components/account/detail-pages';

export default function Page() {
  return (
    <Suspense>
      <ConversationPage staff />
    </Suspense>
  );
}
