import { useEffect, useCallback, useState } from 'react';
import { useGymStore } from '../store/gymStore';
import type { Gym } from '../types/models';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export function useGymData() {
  const setGyms       = useGymStore((s) => s.setGyms);
  const gyms          = useGymStore((s) => s.gyms);
  const selectedGymId = useGymStore((s) => s.selectedGymId);
  const setSelectedGym = useGymStore((s) => s.setSelectedGym);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchGyms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/gyms`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data: Gym[] = await res.json();
      setGyms(data);
      if (!selectedGymId && data.length > 0) {
        setSelectedGym(data[0].id);
      }
    } catch (err) {
      console.error('[useGymData] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load gyms');
    } finally {
      setLoading(false);
    }
  }, [setGyms, selectedGymId, setSelectedGym]);

  useEffect(() => {
    fetchGyms();
    const interval = setInterval(fetchGyms, 30_000);
    return () => clearInterval(interval);
  }, [fetchGyms]);

  const selectedGym = gyms.find((g) => g.id === selectedGymId) ?? null;

  return { gyms, selectedGym, selectedGymId, setSelectedGym, refetch: fetchGyms, loading, error };
}
