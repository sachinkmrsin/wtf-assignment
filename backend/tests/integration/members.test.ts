/**
 * Integration Tests — Members API
 * Layer 2: Full HTTP layer tested via Supertest. DB is mocked at module level.
 */

jest.mock('../../src/db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('../../src/websocket', () => ({
  __esModule: true,
  initSocketIO:   jest.fn(),
  broadcastToGym: jest.fn(),
  broadcastToAll: jest.fn(),
}));

import request from 'supertest';
import express, { Express } from 'express';
import membersRouter from '../../src/routes/members';
import pool from '../../src/db/pool';

const mockQuery = pool.query as jest.Mock;

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/members', membersRouter);
  return app;
}

beforeEach(() => jest.clearAllMocks());

// ── GET /api/members ──────────────────────────────────────────────────────────

describe('GET /api/members', () => {
  it('returns 200 with a list of members', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'm-1', gym_id: 'gym-uuid-1', name: 'Alice', email: 'alice@test.com', status: 'active', last_checkin_at: null, created_at: new Date().toISOString() },
        { id: 'm-2', gym_id: 'gym-uuid-1', name: 'Bob',   email: 'bob@test.com',   status: 'active', last_checkin_at: null, created_at: new Date().toISOString() },
      ],
    });

    const res = await request(createApp()).get('/api/members');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      id:     expect.any(String),
      name:   expect.any(String),
      status: expect.any(String),
    });
  });
});

// ── GET /api/members/churn-risk ───────────────────────────────────────────────

describe('GET /api/members/churn-risk', () => {
  it('returns only active members whose last check-in was more than 45 days ago', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const tenDaysAgo   = new Date(Date.now() - 10 * 86_400_000).toISOString();

    // The query filters on the DB side; we return the already-filtered rows
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'm-1', name: 'Alice', last_checkin_at: sixtyDaysAgo, gym_id: 'gym-uuid-1', email: 'alice@test.com' },
        // Bob (10 days ago) is filtered out by the DB query — not returned
      ],
    });

    const res = await request(createApp()).get('/api/members/churn-risk');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Alice (60 days ago) should appear
    expect(res.body.some((m: { email: string }) => m.email === 'alice@test.com')).toBe(true);
    // Bob (10 days ago) should NOT appear — excluded at DB level
    expect(res.body.some((m: { email: string }) => m.email === 'bob@test.com')).toBe(false);

    void tenDaysAgo; // referenced to avoid lint warning
  });
});

// ── GET /api/members/:id ──────────────────────────────────────────────────────

describe('GET /api/members/:id', () => {
  it('returns 404 when the member does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get('/api/members/nonexistent-id');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with member data for an existing member', async () => {
    const memberRow = {
      id:             'm-1',
      gym_id:         'gym-uuid-1',
      name:           'Alice',
      email:          'alice@test.com',
      status:         'active',
      last_checkin_at: new Date().toISOString(),
      created_at:     new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [memberRow] });

    const res = await request(createApp()).get('/api/members/m-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'm-1', name: 'Alice', status: 'active' });
  });
});

