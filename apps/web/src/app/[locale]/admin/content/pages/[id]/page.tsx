'use client';

import { Suspense, use } from 'react';
import { ContentPageEditor } from '@/components/admin/content/pages';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ContentPageEditor id={id} />
    </Suspense>
  );
}
