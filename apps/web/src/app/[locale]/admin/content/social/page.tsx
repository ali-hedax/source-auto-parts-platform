'use client';

import { Suspense } from 'react';
import { ContentSocialPage } from '@/components/admin/content/social';

export default function Page() {
  return (
    <Suspense>
      <ContentSocialPage />
    </Suspense>
  );
}
