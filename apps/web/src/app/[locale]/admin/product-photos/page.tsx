'use client';

import { Suspense } from 'react';
import { BulkPhotoUpload } from '@/components/admin/bulk-photos';

/** Panel → «قطعات» → «بارگذاری گروهی عکس»: one path, matched by SKU, part number or equivalent. */
export default function Page() {
  return (
    <Suspense>
      <BulkPhotoUpload />
    </Suspense>
  );
}
