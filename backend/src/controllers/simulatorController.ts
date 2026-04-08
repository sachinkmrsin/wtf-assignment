import { Request, Response } from 'express';
import {
  startSimulator,
  stopSimulator,
  resetSimulator,
  getSimulatorStatus,
  SimulatorSpeed,
} from '../jobs/simulator';

const VALID_SPEEDS: SimulatorSpeed[] = [1, 5, 10];

// ── POST /api/simulator/start ─────────────────────────────────────────────────

export async function startSimulation(req: Request, res: Response): Promise<void> {
  const { speed } = req.body as { speed?: unknown };

  if (speed === undefined || !VALID_SPEEDS.includes(speed as SimulatorSpeed)) {
    res.status(400).json({
      error: 'Invalid speed. Must be one of: 1, 5, 10',
    });
    return;
  }

  startSimulator(speed as SimulatorSpeed);
  res.json({ status: 'running', speed });
}

// ── POST /api/simulator/stop ──────────────────────────────────────────────────

export async function stopSimulation(_req: Request, res: Response): Promise<void> {
  stopSimulator();
  res.json({ status: 'paused' });
}

// ── POST /api/simulator/reset ─────────────────────────────────────────────────

export async function resetSimulation(_req: Request, res: Response): Promise<void> {
  try {
    await resetSimulator();
    res.json({ status: 'reset' });
  } catch (err) {
    console.error('[simulatorController] reset:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── GET /api/simulator/status (bonus — useful for clients) ────────────────────

export function getStatus(_req: Request, res: Response): void {
  res.json(getSimulatorStatus());
}
