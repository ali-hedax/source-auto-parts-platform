import 'server-only';
import { cache } from 'react';
import type { BuilderDocument } from '@hedax/contracts';
import { serverApi } from './api/server';
import { displayCurrency } from './preferences';
import { loadBuilderData } from '@/components/builder/data';

export const getPublishedBuilder = cache((slug: string) => serverApi<BuilderDocument | null>(`/site/builder/${slug}`, { publicCache: 30 }).catch(() => null));
export async function getBuilderData(document: BuilderDocument | null) {
  return loadBuilderData(document, <T>(path: string) => serverApi<T>(path, { publicCache: 60 }), await displayCurrency());
}
