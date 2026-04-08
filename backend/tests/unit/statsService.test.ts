/**
 * Unit Tests — Stats Service
 * Layer 1: DB is mocked. Verifies query parsing, null handling, and defaults.
 */
jest.mock('../../src/db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import {
  getGymStats,
  getAllGymIds,
  getGymCapacity,
  refreshHeatmap,
} from '../../src/services/statsService';
import pool from '../../src/db/pool';

const mockQuery = pool.query as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getGymStats', () => {
  it('returns correctly parsed stats for a valid gym', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          gym_id: 'gym-uuid-1',
          gym_name: 'Iron Peak',
          capacity: '100',
          live_occupancy: '23',
          today_revenue: '1234.56',
          today_checkins: '45',
          weekly_checkins: '210',
          active_members: '480',
        },
      ],
    });

    const stats = await getGymStats('gym-uuid-1');

    expect(stats).not.toBeNull();
    expect(stats!.gymId).toBe('gym-uuid-1');
    expect(stats!.liveOccupancy).toBe(23);
    expect(stats!.todayRevenue).toBeCloseTo(1234.56);
    expect(stats!.activeMembers).toBe(480);
    expect(stats!.capacity).toBe(100);
  });

  it('returns null when the gym does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const stats = await getGymStats('nonexistent-id');

    expect(stats).toBeNull();
  });
});

describe('getAllGymIds', () => {
  it('returns an array of gym ID strings', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });

    const ids = await getAllGymIds();

    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('getGymCapacity', () => {
  it('returns the capacity value for a known gym', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ capacity: 150 }] });

    const cap = await getGymCapacity('gym-uuid-1');

    expect(cap).toBe(150);
  });

  it('returns default capacity of 100 when the gym is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const cap = await getGymCapacity('nonexistent-id');

    expect(cap).toBe(100);
  });
});

describe('refreshHeatmap', () => {
  it('calls REFRESH MATERIALIZED VIEW CONCURRENTLY on gym_hourly_stats', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await refreshHeatmap();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('REFRESH MATERIALIZED VIEW CONCURRENTLY gym_hourly_stats')
    );
  });
});
