/**
 * Unit Tests — Simulator Service
 * Layer 1: DB and WebSocket are mocked. Verifies that the simulator correctly
 * generates check-in, checkout, and payment events with realistic distribution.
 */

jest.mock('../../src/db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('../../src/websocket', () => ({
  __esModule: true,
  broadcastToGym: jest.fn(),
  broadcastToAll: jest.fn(),
}));
jest.mock('../../src/services/statsService', () => ({
  __esModule: true,
  getAllGymIds: jest.fn().mockResolvedValue(['gym-uuid-1', 'gym-uuid-2']),
  getGymStats: jest.fn().mockResolvedValue({
    gymId: 'gym-uuid-1',
    todayRevenue: 500,
    weeklyCheckins: 120,
  }),
}));

import {
  runSimulatorTick,
  simulateCheckin,
  simulateCheckout,
  simulatePayment,
} from '../../src/services/simulatorService';
import pool from '../../src/db/pool';
import * as ws from '../../src/websocket';

const mockQuery = pool.query as jest.Mock;
const mockBcastGym = ws.broadcastToGym as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// ── simulateCheckin ───────────────────────────────────────────────────────────

describe('simulateCheckin', () => {
  it('inserts a check-in record and broadcasts gym:checkin + gym:occupancy events', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'member-uuid-1', name: 'Alice', plan_type: 'monthly' }],
      }) // getRandomMemberForGym
      .mockResolvedValueOnce({ rows: [] }) // INSERT checkin
      .mockResolvedValueOnce({ rows: [] }) // UPDATE member.last_checkin_at
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // live occupancy count
      .mockResolvedValueOnce({ rows: [{ capacity: 100 }] }); // gym capacity

    await simulateCheckin('gym-uuid-1');

    expect(mockBcastGym).toHaveBeenCalledWith(
      'gym-uuid-1',
      'gym:checkin',
      expect.objectContaining({
        gymId: 'gym-uuid-1',
        memberId: 'member-uuid-1',
        memberName: 'Alice',
        currentOccupancy: 5,
        capacityPct: 5,
      })
    );
    expect(mockBcastGym).toHaveBeenCalledWith(
      'gym-uuid-1',
      'gym:occupancy',
      expect.objectContaining({ count: 5, capacity: 100 })
    );
  });

  it('does nothing when no active members exist in the gym', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no active members

    await simulateCheckin('gym-uuid-1');

    expect(mockBcastGym).not.toHaveBeenCalled();
    // Only one query (member lookup) should have been made
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ── simulateCheckout ──────────────────────────────────────────────────────────

describe('simulateCheckout', () => {
  it('closes the open check-in and broadcasts a gym:checkout event', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'checkin-uuid-1', member_id: 'member-uuid-1', member_name: 'Bob' }],
      }) // SELECT with JOIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE checkin set checked_out
      .mockResolvedValueOnce({ rows: [{ count: '4' }] }) // live occupancy count
      .mockResolvedValueOnce({ rows: [{ capacity: 100 }] }); // gym capacity

    await simulateCheckout('gym-uuid-1');

    expect(mockBcastGym).toHaveBeenCalledWith(
      'gym-uuid-1',
      'gym:checkout',
      expect.objectContaining({
        gymId: 'gym-uuid-1',
        checkinId: 'checkin-uuid-1',
        memberName: 'Bob',
        currentOccupancy: 4,
      })
    );
  });

  it('does nothing when there are no open check-ins for the gym', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no open check-ins

    await simulateCheckout('gym-uuid-1');

    expect(mockBcastGym).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ── simulatePayment ───────────────────────────────────────────────────────────

describe('simulatePayment', () => {
  it('records a payment and broadcasts a payment:new event with a realistic amount', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'member-uuid-1', name: 'Carol', plan_type: 'quarterly' }],
      }) // random member
      .mockResolvedValueOnce({ rows: [] }) // INSERT payment
      .mockResolvedValueOnce({ rows: [{ today_total: '520.00' }] }); // today's revenue total

    await simulatePayment('gym-uuid-1');

    expect(mockBcastGym).toHaveBeenCalledWith(
      'gym-uuid-1',
      'payment:new',
      expect.objectContaining({
        gymId: 'gym-uuid-1',
        memberId: 'member-uuid-1',
        memberName: 'Carol',
        planType: 'quarterly',
        todayTotal: 520,
      })
    );

    // Verify payment amount is within expected range (₹20–₹150)
    const paymentCall = mockBcastGym.mock.calls.find(([, event]) => event === 'payment:new');
    const amount: number = paymentCall?.[2]?.amount;
    expect(amount).toBeGreaterThanOrEqual(20);
    expect(amount).toBeLessThanOrEqual(150);
  });

  it('does nothing when no active members exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no active members

    await simulatePayment('gym-uuid-1');

    expect(mockBcastGym).not.toHaveBeenCalled();
  });
});

// ── runSimulatorTick ──────────────────────────────────────────────────────────

describe('runSimulatorTick', () => {
  it('handles individual action errors gracefully without propagating the exception', async () => {
    // DB errors inside the tick are caught per-gym so the whole tick does not throw
    mockQuery.mockRejectedValue(new Error('db connection lost'));

    await expect(runSimulatorTick()).resolves.not.toThrow();
  });

  it('executes a check-in when the random action value is below 0.45 (45% probability)', async () => {
    const spy = jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0) // count = 1
      .mockReturnValueOnce(0) // gymId = 'gym-uuid-1'
      .mockReturnValueOnce(0.3); // action → check-in branch

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'member-uuid-1', name: 'Dave', plan_type: 'annual' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ capacity: 100 }] });

    await runSimulatorTick();

    expect(mockBcastGym).toHaveBeenCalledWith('gym-uuid-1', 'gym:checkin', expect.any(Object));
    spy.mockRestore();
  });

  it('executes a checkout when the random action value is between 0.45 and 0.75 (30% probability)', async () => {
    const spy = jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0) // count = 1
      .mockReturnValueOnce(0) // gymId = 'gym-uuid-1'
      .mockReturnValueOnce(0.6); // action → checkout branch (0.45 ≤ x < 0.75)

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'checkin-uuid-1', member_id: 'member-uuid-1', member_name: 'Eve' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ capacity: 100 }] });

    await runSimulatorTick();

    expect(mockBcastGym).toHaveBeenCalledWith('gym-uuid-1', 'gym:checkout', expect.any(Object));
    spy.mockRestore();
  });
});
