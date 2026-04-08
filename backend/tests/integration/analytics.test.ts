/**
 * Integration Tests — Analytics API
 * Layer 2: Full HTTP layer tested via Supertest. DB is mocked at module level.
 */

jest.mock('../../src/db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('../../src/websocket', () => ({
  __esModule: true,
  initSocketIO: jest.fn(),
  broadcastToGym: jest.fn(),
  broadcastToAll: jest.fn(),
}));

import request from 'supertest';
import express, { Express } from 'express';
import analyticsRouter from '../../src/routes/analytics';
import pool from '../../src/db/pool';

const mockQuery = pool.query as jest.Mock;

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRouter);
  return app;
}

beforeEach(() => jest.clearAllMocks());

// ── GET /api/analytics/cross-gym ─────────────────────────────────────────────

describe('GET /api/analytics/cross-gym', () => {
  it('returns 200 with an array of gym revenue entries', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { gym_id: 'gym-uuid-1', gym_name: 'Iron Peak', total_revenue: 50000, rank: 1 },
        { gym_id: 'gym-uuid-2', gym_name: 'Flex Zone', total_revenue: 35000, rank: 2 },
      ],
    });

    const res = await request(createApp()).get('/api/analytics/cross-gym');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      gym_id: expect.any(String),
      gym_name: expect.any(String),
      total_revenue: expect.any(Number),
    });
  });
});

// ── GET /api/analytics/occupancy/:gymId ──────────────────────────────────────

describe('GET /api/analytics/occupancy/:gymId', () => {
  it('returns 200 with a numeric live occupancy count', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '18' }] });

    const res = await request(createApp()).get('/api/analytics/occupancy/gym-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count');
    expect(typeof res.body.count).toBe('number');
    expect(res.body.count).toBe(18);
  });
});

// ── GET /api/analytics/revenue/:gymId ────────────────────────────────────────

describe('GET /api/analytics/revenue/:gymId', () => {
  it('returns 200 with a numeric today revenue total', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total: '4250.50' }] });

    const res = await request(createApp()).get('/api/analytics/revenue/gym-uuid-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(typeof res.body.total).toBe('number');
    expect(res.body.total).toBeCloseTo(4250.5);
  });
});
