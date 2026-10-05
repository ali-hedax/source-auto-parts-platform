'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const latest = useRef(0);
  const load = useCallback(async () => {
    // A filter changed twice in quick succession (or a reload right after a change) loads
    // twice; answers can arrive out of order, so only the newest one is kept.
    const seq = ++latest.current;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await api<T>(path);
      if (seq !== latest.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (seq !== latest.current) return;
      setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, null));
    } finally {
      if (seq === latest.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}
