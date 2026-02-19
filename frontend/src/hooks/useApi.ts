import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { api } from '../api/client';
import { AuthContext } from './useAuth';

export function useApi<T>(path: string | null, deps: unknown[] = [], intervalMs?: number) {
  const auth = useContext(AuthContext);
  const activeTenantId = auth?.activeTenantId ?? null;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const consecutiveErrors = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    // Only show loading spinner on initial fetch, not on polls
    const isInitial = !hasFetched.current;
    if (isInitial) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await api<T>(path);
      setData(result);
      setError(null);
      hasFetched.current = true;
      consecutiveErrors.current = 0;
    } catch (err) {
      consecutiveErrors.current++;
      // On poll failure: keep existing data, only set error on initial load
      if (isInitial) {
        setError((err as Error).message);
      }
    } finally {
      if (isInitial) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, activeTenantId, ...deps]);

  useEffect(() => {
    hasFetched.current = false;
    consecutiveErrors.current = 0;
    load();
  }, [load]);

  // Auto-refresh polling with backoff on consecutive errors
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (intervalMs && intervalMs > 0) {
      intervalRef.current = setInterval(() => {
        // Skip poll if too many consecutive errors (back off)
        if (consecutiveErrors.current >= 3) return;
        load();
      }, intervalMs);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load, intervalMs]);

  return { data, loading, error, reload: load, setData };
}
