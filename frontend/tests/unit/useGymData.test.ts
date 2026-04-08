import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGymData } from '../../src/hooks/useGymData';
import { useGymStore } from '../../src/store/gymStore';

const mockGyms = [
  { id: 'gym-1', name: 'Iron Peak', location: 'Downtown', capacity: 100, live_occupancy: 23, created_at: '' },
  { id: 'gym-2', name: 'Flex Zone', location: 'Westside', capacity: 80, live_occupancy: 10, created_at: '' },
];

describe('useGymData', () => {
  beforeEach(() => {
    useGymStore.setState({ gyms: [], selectedGymId: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockGyms),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches gyms and populates store on mount', async () => {
    const { result } = renderHook(() => useGymData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.gyms).toHaveLength(2);
    expect(result.current.gyms[0].name).toBe('Iron Peak');
  });

  it('auto-selects first gym when none selected', async () => {
    const { result } = renderHook(() => useGymData());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.selectedGymId).toBe('gym-1');
  });

  it('returns selectedGym matching selectedGymId', async () => {
    useGymStore.setState({ gyms: mockGyms, selectedGymId: 'gym-2' });
    const { result } = renderHook(() => useGymData());

    expect(result.current.selectedGym?.name).toBe('Flex Zone');
  });
});

