/**
 * Unit Tests — Anomaly Detection Logic
 * Layer 1: All DB and WebSocket calls are mocked. No real Postgres required.
 */

// ── Mocks must be declared before imports (jest hoists them) ──────────────────
jest.mock('../../src/db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('../../src/websocket', () => ({
  __esModule: true,
  broadcastToGym: jest.fn(),
  broadcastToAll: jest.fn(),
}));

import {
  checkZeroCheckinsAnomaly,
  checkOccupancyAnomaly,
  checkRevenueAnomaly,
  detectAndSave,
  resolveAnomaly,
} from '../../src/services/anomalyService';
import pool from '../../src/db/pool';
import * as ws from '../../src/websocket';

const mockQuery = pool.query as jest.Mock;
const mockBcastGym = ws.broadcastToGym as jest.Mock;
const mockBcastAll = ws.broadcastToAll as jest.Mock;

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'anomaly-uuid-1',
  gym_id: 'gym-uuid-1',
  type: 'zero_checkins',
  severity: 'warning',
  message: 'test message',
  detected_at: new Date().toISOString(),
  ...overrides,
});

// ── Scenario A: zero_checkins ─────────────────────────────────────────────────

describe('checkZeroCheckinsAnomaly', () => {
  it('fires when open_count = 0 and last check-in was more than 2 hours ago', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1_000).toISOString();

    mockQuery
      .mockResolvedValueOnce({ rows: [{ open_count: '0', last_checkin: threeHoursAgo }] })
      .mockResolvedValueOnce({ rows: [] }) // hasUnresolved → none
      .mockResolvedValueOnce({ rows: [fakeRow({ type: 'zero_checkins' })] }); // detectAndSave INSERT

    await checkZeroCheckinsAnomaly('gym-uuid-1');

    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockBcastGym).toHaveBeenCalledWith(
      'gym-uuid-1',
      'anomaly:detected',
      expect.objectContaining({ type: 'zero_checkins', severity: 'warning' })
    );
  });

  it('fires when there has NEVER been a check-in (last_checkin is null)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ open_count: '0', last_checkin: null }] })
      .mockResolvedValueOnce({ rows: [] }) // hasUnresolved → none
      .mockResolvedValueOnce({ rows: [fakeRow({ type: 'zero_checkins' })] }); // detectAndSave

    await checkZeroCheckinsAnomaly('gym-uuid-1');

    expect(mockBcastGym).toHaveBeenCalledWith('gym-uuid-1', 'anomaly:detected', expect.any(Object));
  });

  it('does NOT fire when the last check-in was less than 2 hours ago', async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1_000).toISOString();

    mockQuery.mockResolvedValueOnce({ rows: [{ open_count: '0', last_checkin: thirtyMinAgo }] });

    await checkZeroCheckinsAnomaly('gym-uuid-1');

    // Only the initial SELECT; no hasUnresolved or detectAndSave
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockBcastGym).not.toHaveBeenCalled();
  });

  it('does NOT create a duplicate when an unresolved zero_checkins anomaly already exists', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1_000).toISOString();

    mockQuery
      .mockResolvedValueOnce({ rows: [{ open_count: '0', last_checkin: threeHoursAgo }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // hasUnresolved → already exists

    await checkZeroCheckinsAnomaly('gym-uuid-1');

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockBcastGym).not.toHaveBeenCalled();
  });

  it('auto-resolves the anomaly when activity resumes (open_count > 0)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ open_count: '5', last_checkin: new Date().toISOString() }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'anomaly-uuid-1', gym_id: 'gym-uuid-1' }] }); // resolveByType

    await checkZeroCheckinsAnomaly('gym-uuid-1');

    expect(mockBcastAll).toHaveBeenCalledWith(
      'anomaly:resolved',
      expect.objectContaining({ id: 'anomaly-uuid-1' })
    );
  });
});

// ── Scenario B: capacity_breach ───────────────────────────────────────────────

describe('checkOccupancyAnomaly', () => {
  it('fires a critical anomaly when occupancy exceeds 90% of capacity', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '95' }] }) // 95/100 = 95% > 90%
      .mockResolvedValueOnce({ rows: [] }) // hasUnresolved → none
      .mockResolvedValueOnce({
        rows: [fakeRow({ type: 'capacity_breach', severity: 'critical' })],
      });

    await checkOccupancyAnomaly('gym-uuid-1', 100);

    expect(mockBcastGym).toHaveBeenCalledWith(
      'gym-uuid-1',
      'anomaly:detected',
      expect.objectContaining({ type: 'capacity_breach', severity: 'critical' })
    );
  });

  it('does NOT fire when occupancy is at exactly 90% (strict > boundary)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '90' }] }); // exactly 90%, NOT > 90%

    await checkOccupancyAnomaly('gym-uuid-1', 100);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockBcastGym).not.toHaveBeenCalled();
  });

  it('does NOT fire a duplicate when a capacity_breach is already unresolved', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '97' }] }) // 97% > 90%
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // hasUnresolved → exists

    await checkOccupancyAnomaly('gym-uuid-1', 100);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockBcastGym).not.toHaveBeenCalled();
  });

  it('auto-resolves capacity_breach when occupancy drops below 85%', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '80' }] }) // 80% < 85% → auto-resolve
      .mockResolvedValueOnce({ rows: [{ id: 'anomaly-uuid-1', gym_id: 'gym-uuid-1' }] });

    await checkOccupancyAnomaly('gym-uuid-1', 100);

    expect(mockBcastAll).toHaveBeenCalledWith(
      'anomaly:resolved',
      expect.objectContaining({ id: 'anomaly-uuid-1' })
    );
  });
});

// ── Scenario C: revenue_drop ──────────────────────────────────────────────────

describe('checkRevenueAnomaly', () => {
  it('fires when today revenue is less than 30% of the same day last week (>70% drop)', async () => {
    // 50 < 500 × 0.3 = 150 → revenue drop > 70%
    mockQuery
      .mockResolvedValueOnce({ rows: [{ today_revenue: '50', last_week_revenue: '500' }] })
      .mockResolvedValueOnce({ rows: [] }) // hasUnresolved → none
      .mockResolvedValueOnce({ rows: [fakeRow({ type: 'revenue_drop' })] }); // detectAndSave

    await checkRevenueAnomaly('gym-uuid-1');

    expect(mockBcastGym).toHaveBeenCalledWith(
      'gym-uuid-1',
      'anomaly:detected',
      expect.objectContaining({ type: 'revenue_drop' })
    );
  });

  it('does NOT fire when revenue drop is within the acceptable range', async () => {
    // 400 is NOT < 500 × 0.3 = 150 → no anomaly
    mockQuery.mockResolvedValueOnce({ rows: [{ today_revenue: '400', last_week_revenue: '500' }] });

    await checkRevenueAnomaly('gym-uuid-1');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockBcastGym).not.toHaveBeenCalled();
  });

  it('does NOT fire when last week revenue is 0 (prevents false alarms on new gyms)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ today_revenue: '0', last_week_revenue: '0' }] });

    await checkRevenueAnomaly('gym-uuid-1');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockBcastGym).not.toHaveBeenCalled();
  });

  it('does NOT create a duplicate when an unresolved revenue_drop already exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ today_revenue: '50', last_week_revenue: '500' }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // hasUnresolved → exists

    await checkRevenueAnomaly('gym-uuid-1');

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockBcastGym).not.toHaveBeenCalled();
  });
});

// ── Core helpers ──────────────────────────────────────────────────────────────

describe('detectAndSave', () => {
  it('inserts an anomaly row and broadcasts anomaly:detected to the gym', async () => {
    const row = fakeRow({ type: 'capacity_breach', severity: 'critical' });
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await detectAndSave({
      gymId: 'gym-uuid-1',
      type: 'capacity_breach',
      severity: 'critical',
      message: 'Gym at 95% capacity (95/100)',
    });

    expect(result.id).toBe(row.id);
    expect(result.gymId).toBe('gym-uuid-1');
    expect(mockBcastGym).toHaveBeenCalledWith(
      'gym-uuid-1',
      'anomaly:detected',
      expect.objectContaining({ type: 'capacity_breach', severity: 'critical' })
    );
  });
});

describe('resolveAnomaly', () => {
  it('marks as resolved, returns true, and broadcasts anomaly:resolved', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'anomaly-uuid-1', gym_id: 'gym-uuid-1' }] });

    const ok = await resolveAnomaly('anomaly-uuid-1');

    expect(ok).toBe(true);
    expect(mockBcastAll).toHaveBeenCalledWith('anomaly:resolved', {
      id: 'anomaly-uuid-1',
      gymId: 'gym-uuid-1',
    });
  });

  it('returns false and does NOT broadcast when the anomaly is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const ok = await resolveAnomaly('nonexistent-id');

    expect(ok).toBe(false);
    expect(mockBcastAll).not.toHaveBeenCalled();
  });
});
