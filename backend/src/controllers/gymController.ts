import { Request, Response } from 'express';
import * as gymService from '../services/gymService';

// ── GET /api/gyms ─────────────────────────────────────────────────────────────

export async function listGyms(_req: Request, res: Response): Promise<void> {
  try {
    const gyms = await gymService.listGyms();
    res.json(gyms);
  } catch (err) {
    console.error('[gymController] listGyms:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── GET /api/gyms/:id/live ────────────────────────────────────────────────────

export async function getLiveSnapshot(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const snapshot = await gymService.getLiveSnapshot(id);
    if (!snapshot) {
      res.status(404).json({ error: 'Gym not found' });
      return;
    }
    res.json(snapshot);
  } catch (err) {
    console.error('[gymController] getLiveSnapshot:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── GET /api/gyms/:id/analytics ───────────────────────────────────────────────

export async function getAnalytics(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const dateRange = (req.query.dateRange as string | undefined) ?? '30d';

  // Validate dateRange query param
  if (!['7d', '30d', '90d'].includes(dateRange)) {
    res.status(400).json({
      error: 'Invalid dateRange. Must be one of: 7d, 30d, 90d',
    });
    return;
  }

  try {
    const analytics = await gymService.getGymAnalytics(id, dateRange);
    if (!analytics) {
      res.status(404).json({ error: 'Gym not found' });
      return;
    }
    res.json(analytics);
  } catch (err: unknown) {
    const typed = err as { statusCode?: number; message?: string };
    if (typed.statusCode === 400) {
      res.status(400).json({ error: typed.message });
      return;
    }
    console.error('[gymController] getAnalytics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
