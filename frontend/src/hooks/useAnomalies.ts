import { useEffect, useCallback, useState } from 'react';
import { useAnomalyStore } from '../store/anomalyStore';
import type { Anomaly } from '../types/models';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function useAnomalies() {
  const setAnomalies = useAnomalyStore((s) => s.setAnomalies);
  const anomalies    = useAnomalyStore((s) => s.anomalies);
  const unreadCount  = useAnomalyStore((s) => s.unreadCount);
  const clearUnread  = useAnomalyStore((s) => s.clearUnread);
  const markResolved = useAnomalyStore((s) => s.markResolved);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/anomalies?resolved=false`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data: Anomaly[] = await res.json();
      setAnomalies(data);
    } catch (err) {
      console.error('[useAnomalies] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load anomalies');
    } finally {
      setLoading(false);
    }
  }, [setAnomalies]);

  useEffect(() => {
    fetchAnomalies();
  }, [fetchAnomalies]);

  const resolve = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${API}/api/anomalies/${id}/resolve`, { method: 'PATCH' });
        if (!res.ok) throw new Error(`API ${res.status}`);
        markResolved(id);
      } catch (err) {
        console.error('[useAnomalies] resolve error:', err);
      }
    },
    [markResolved],
  );

  return { anomalies, unreadCount, clearUnread, resolve, refetch: fetchAnomalies, loading, error };
}
