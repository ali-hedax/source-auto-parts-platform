'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { ImportJobPage } from '@/components/admin/imports';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <ImportJobPage jobId={id} />
    </Suspense>
  );
}
