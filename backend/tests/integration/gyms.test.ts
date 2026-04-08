/**
 * Integration Tests — Gyms API
 * Layer 2: Full HTTP layer tested via Supertest. DB is mocked at module level.
 */

jest.mock('../../src/db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('../../src/websocket', () => ({
  __esModule: true,
  initSocketIO:  jest.fn(),
  broadcastToGym: jest.fn(),
  broadcastToAll: jest.fn(),
}));

import request from 'supertest';
import express, { Express } from 'express';
import gymsRouter from '../../src/routes/gyms';
import pool from '../../src/db/pool';

const mockQuery = pool.query as jest.Mock;

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/gyms', gymsRouter);
  return app;
}

beforeEach(() => jest.clearAllMocks());

// ── GET /api/gyms ─────────────────────────────────────────────────────────────

describe('GET /api/gyms', () => {
  it('returns 200 with the correct structure for all 10 seeded gyms', async () => {
    const gymRows = Array.from({ length: 10 }, (_, i) => ({
      id:                `gym-uuid-${i + 1}`,
      name:              `Gym ${i + 1}`,
      city:              'Delhi',
      capacity:          100,
      status:            'active',
      current_occupancy: 0,
      today_revenue:     0,
    }));
    mockQuery.mockResolvedValueOnce({ rows: gymRows });

    const res = await request(createApp()).get('/api/gyms');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(10);
    expect(res.body[0]).toMatchObject({
      id:                expect.any(String),
      name:              expect.any(String),
      city:              expect.any(String),
      capacity:          expect.any(Number),
      current_occupancy: expect.any(Number),
      today_revenue:     expect.any(Number),
    });
  });
});

// ── GET /api/gyms/:id/live ────────────────────────────────────────────────────

describe('GET /api/gyms/:id/live', () => {
  it('returns 200 with all required live-snapshot fields', async () => {
    const gymId = 'gym-uuid-1';

    // findGymLiveSnapshot uses Promise.all with 5 parallel queries (consumed in declaration order)
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: gymId, name: 'Iron Peak', city: 'Delhi', capacity: 100, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ count: 25 }] })          // live occupancy
      .mockResolvedValueOnce({ rows: [{ total: 1500.00 }] })      // today's revenue
      .mockResolvedValueOnce({ rows: [] })                         // recent events
      .mockResolvedValueOnce({ rows: [] });                        // active anomalies

    const res = await request(createApp()).get(`/api/gyms/${gymId}/live`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id:                gymId,
      name:              'Iron Peak',
      city:              'Delhi',
      capacity:          100,
      status:            'active',
      current_occupancy: 25,
      today_revenue:     1500,
      recent_events:     expect.any(Array),
      active_anomalies:  expect.any(Array),
    });
  });

  it('returns 404 when the gym does not exist', async () => {
    // All 5 parallel queries: gym lookup returns empty
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // gym not found
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get('/api/gyms/nonexistent-id/live');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ── GET /api/gyms/:id/analytics ───────────────────────────────────────────────

describe('GET /api/gyms/:id/analytics', () => {
  it('returns 400 for an invalid dateRange query parameter', async () => {
    const res = await request(createApp()).get('/api/gyms/gym-uuid-1/analytics?dateRange=1y');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    // No DB calls should have been made
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns 404 when the gym is not found for a valid dateRange', async () => {
    // findGymById returns empty rows → getGymAnalytics returns null
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get('/api/gyms/nonexistent-id/analytics?dateRange=7d');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
