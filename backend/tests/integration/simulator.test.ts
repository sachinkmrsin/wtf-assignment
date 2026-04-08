/**
 * Integration Tests — Simulator API
 * Layer 2: Full HTTP layer tested via Supertest.
 * The simulator job is mocked to avoid starting real timers.
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
// Mock the jobs/simulator module to prevent real setInterval timers in tests
jest.mock('../../src/jobs/simulator', () => ({
  __esModule: true,
  startSimulator:      jest.fn(),
  stopSimulator:       jest.fn(),
  resetSimulator:      jest.fn().mockResolvedValue(undefined),
  getSimulatorStatus:  jest.fn().mockReturnValue({ state: 'paused', speed: 1 }),
}));

import request from 'supertest';
import express, { Express } from 'express';
import simulatorRouter from '../../src/routes/simulator';
import * as simulatorJob from '../../src/jobs/simulator';

const mockStart  = simulatorJob.startSimulator  as jest.Mock;
const mockStop   = simulatorJob.stopSimulator   as jest.Mock;
const mockReset  = simulatorJob.resetSimulator  as jest.Mock;
const mockStatus = simulatorJob.getSimulatorStatus as jest.Mock;

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/simulator', simulatorRouter);
  return app;
}

beforeEach(() => jest.clearAllMocks());

// ── POST /api/simulator/start ─────────────────────────────────────────────────

describe('POST /api/simulator/start', () => {
  it('returns 200 with { status: "running", speed } when called with a valid speed', async () => {
    const res = await request(createApp())
      .post('/api/simulator/start')
      .send({ speed: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'running', speed: 1 });
    expect(mockStart).toHaveBeenCalledWith(1);
  });

  it('returns { status: "running" } for each valid speed (1, 5, 10)', async () => {
    for (const speed of [1, 5, 10] as const) {
      jest.clearAllMocks();
      const res = await request(createApp())
        .post('/api/simulator/start')
        .send({ speed });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('running');
      expect(res.body.speed).toBe(speed);
    }
  });

  it('returns 400 when speed is missing from the request body', async () => {
    const res = await request(createApp())
      .post('/api/simulator/start')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('returns 400 when speed is an invalid value', async () => {
    const res = await request(createApp())
      .post('/api/simulator/start')
      .send({ speed: 99 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockStart).not.toHaveBeenCalled();
  });
});

// ── POST /api/simulator/stop ──────────────────────────────────────────────────

describe('POST /api/simulator/stop', () => {
  it('returns 200 with { status: "paused" }', async () => {
    const res = await request(createApp()).post('/api/simulator/stop');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'paused' });
    expect(mockStop).toHaveBeenCalledTimes(1);
  });
});

// ── POST /api/simulator/reset ─────────────────────────────────────────────────

describe('POST /api/simulator/reset', () => {
  it('returns 200 with { status: "reset" }', async () => {
    const res = await request(createApp()).post('/api/simulator/reset');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'reset' });
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});

// ── GET /api/simulator/status ─────────────────────────────────────────────────

describe('GET /api/simulator/status', () => {
  it('returns 200 with the current simulator state and speed', async () => {
    mockStatus.mockReturnValueOnce({ state: 'running', speed: 5 });

    const res = await request(createApp()).get('/api/simulator/status');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'running', speed: 5 });
  });
});

