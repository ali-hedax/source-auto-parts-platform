import { Suspense } from 'react';
import { KnowledgeCatalogPage } from '@/components/admin/knowledge-catalog';

export default function Page() {
  return (
    <Suspense>
      <KnowledgeCatalogPage />
    </Suspense>
  );
}
