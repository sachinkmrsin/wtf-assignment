import { Request, Response } from 'express';
import { getCrossGymRevenue } from '../services/analyticsService';

// ── GET /api/analytics/cross-gym ──────────────────────────────────────────────

export async function crossGymRevenue(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getCrossGymRevenue();
    res.json(data);
  } catch (err) {
    console.error('[analyticsController] crossGymRevenue:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

