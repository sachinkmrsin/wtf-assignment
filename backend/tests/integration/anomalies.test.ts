/**
 * Integration Tests — Anomalies API
 * Layer 2: Full HTTP layer tested via Supertest. DB and WebSocket are mocked.
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
import anomaliesRouter from '../../src/routes/anomalies';
import pool from '../../src/db/pool';

const mockQuery = pool.query as jest.Mock;

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/anomalies', anomaliesRouter);
  return app;
}

beforeEach(() => jest.clearAllMocks());

// ── GET /api/anomalies ────────────────────────────────────────────────────────

describe('GET /api/anomalies', () => {
  it('returns 200 with an empty array when no anomalies are active', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get('/api/anomalies');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 with active anomaly records', async () => {
    const anomalyRow = {
      id: 'anomaly-uuid-1',
      gym_id: 'gym-uuid-1',
      gym_name: 'Iron Peak',
      type: 'capacity_breach',
      severity: 'critical',
      message: 'Gym at 95% capacity',
      resolved: false,
      dismissed: false,
      detected_at: new Date().toISOString(),
      resolved_at: null,
    };
    mockQuery.mockResolvedValueOnce({ rows: [anomalyRow] });

    const res = await request(createApp()).get('/api/anomalies');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 'anomaly-uuid-1',
      severity: 'critical',
      type: 'capacity_breach',
    });
  });

  it('returns 400 when an invalid severity filter is supplied', async () => {
    const res = await request(createApp()).get('/api/anomalies?severity=extreme');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    // Validation happens before any DB call
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

// ── PATCH /api/anomalies/:id/dismiss ─────────────────────────────────────────

describe('PATCH /api/anomalies/:id/dismiss', () => {
  it('returns 403 when the anomaly severity is critical (cannot be dismissed)', async () => {
    // findAnomalyById → returns a critical anomaly
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'anomaly-uuid-1',
          gym_id: 'gym-uuid-1',
          gym_name: 'Iron Peak',
          type: 'capacity_breach',
          severity: 'critical',
          message: 'Gym at 95% capacity',
          resolved: false,
          dismissed: false,
          detected_at: new Date().toISOString(),
          resolved_at: null,
        },
      ],
    });

    const res = await request(createApp()).patch('/api/anomalies/anomaly-uuid-1/dismiss');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: expect.stringContaining('Critical') });
  });

  it('returns 404 when the anomaly does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // findAnomalyById → not found

    const res = await request(createApp()).patch('/api/anomalies/nonexistent-id/dismiss');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 and the updated record when a warning anomaly is successfully dismissed', async () => {
    const warningRow = {
      id: 'anomaly-uuid-2',
      gym_id: 'gym-uuid-1',
      gym_name: 'Iron Peak',
      type: 'zero_checkins',
      severity: 'warning',
      message: 'No active check-ins',
      resolved: false,
      dismissed: false,
      detected_at: new Date().toISOString(),
      resolved_at: null,
    };
    // findAnomalyById → warning anomaly exists
    mockQuery.mockResolvedValueOnce({ rows: [warningRow] });
    // dismissAnomalyById → returns updated row with dismissed = true
    mockQuery.mockResolvedValueOnce({ rows: [{ ...warningRow, dismissed: true }] });

    const res = await request(createApp()).patch('/api/anomalies/anomaly-uuid-2/dismiss');

    expect(res.status).toBe(200);
    expect(res.body.dismissed).toBe(true);
  });
});
