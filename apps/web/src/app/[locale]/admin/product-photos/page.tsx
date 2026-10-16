'use client';

import { Suspense } from 'react';
import { BulkPhotoUpload } from '@/components/admin/bulk-photos';

export default function Page() {
  return (
    <Suspense>
      <BulkPhotoUpload />
    </Suspense>
  );
}
