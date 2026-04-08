import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';

import { initSocketIO } from './websocket';
import { runSeedIfNeeded } from './db/seeds/seed';
import pool from './db/pool';

import apiRouter from './routes';

import { startSimulator } from './jobs/simulator';
import { startAnomalyDetector } from './jobs/anomalyDetector';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL ?? '*' }));
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── REST routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── Socket.io ─────────────────────────────────────────────────────────────────
initSocketIO(httpServer);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Verify DB connection
  await pool.query('SELECT 1');
  console.log('[app] Database connected');

  // Idempotent seed — skips if already seeded
  await runSeedIfNeeded(pool);

  // Start background jobs
  startSimulator();
  startAnomalyDetector();

  const PORT = parseInt(process.env.PORT ?? '3001', 10);
  httpServer.listen(PORT, () => {
    console.log(`[app] Server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[app] Fatal bootstrap error:', err);
  process.exit(1);
});

export { app, httpServer };
