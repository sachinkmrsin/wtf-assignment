import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAnomalies } from '../../src/hooks/useAnomalies';
import { useAnomalyStore } from '../../src/store/anomalyStore';
import type { Anomaly } from '../../src/types/models';

const mockAnomalies: Anomaly[] = [
  {
    id: 'a-1', gym_id: 'gym-1', gym_name: 'Iron Peak',
    type: 'capacity_breach', severity: 'high',
    message: 'Over 95% capacity', resolved: false,
    detected_at: new Date().toISOString(),
  },
  {
    id: 'a-2', gym_id: 'gym-2', gym_name: 'Flex Zone',
    type: 'revenue_spike', severity: 'medium',
    message: 'Revenue spike', resolved: false,
    detected_at: new Date().toISOString(),
  },
];

describe('useAnomalies', () => {
  beforeEach(() => {
    useAnomalyStore.setState({ anomalies: [], unreadCount: 0 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAnomalies),
    }));
  });

  afterEach(() => vi.restoreAllMocks());

  it('fetches anomalies on mount', async () => {
    const { result } = renderHook(() => useAnomalies());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.anomalies).toHaveLength(2);
  });

  it('resolve() calls PATCH endpoint and marks anomaly resolved in store', async () => {
    useAnomalyStore.setState({ anomalies: mockAnomalies, unreadCount: 0 });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockAnomalies) }) // initial fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'a-1', resolved: true }) }); // PATCH
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAnomalies());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.resolve('a-1');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/anomalies/a-1/resolve'),
      expect.objectContaining({ method: 'PATCH' }),
    );

    const state = useAnomalyStore.getState();
    expect(state.anomalies.find((a) => a.id === 'a-1')?.resolved).toBe(true);
  });

  it('unreadCount is tracked and clearUnread resets it', () => {
    useAnomalyStore.setState({ anomalies: [], unreadCount: 3 });
    const { result } = renderHook(() => useAnomalies());

    expect(result.current.unreadCount).toBe(3);

    act(() => result.current.clearUnread());

    expect(result.current.unreadCount).toBe(0);
  });
});

