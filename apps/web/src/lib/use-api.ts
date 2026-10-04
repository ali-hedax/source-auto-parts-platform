'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import { ApiRequestError } from './api/errors';

export interface ApiState<T> {
  data: T | null;
  error: ApiRequestError | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Small data hook for private (never cached) views: loading / error / data / reload. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, null));
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}
