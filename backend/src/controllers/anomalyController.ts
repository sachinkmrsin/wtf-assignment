import { Request, Response } from 'express';
import * as anomalyQueryService from '../services/anomalyQueryService';

// ── GET /api/anomalies ────────────────────────────────────────────────────────

export async function listAnomalies(req: Request, res: Response): Promise<void> {
  const { gym_id, severity } = req.query;

  // Validate severity if provided
  if (severity !== undefined && !['warning', 'critical'].includes(severity as string)) {
    res.status(400).json({
      error: 'Invalid severity. Must be one of: warning, critical',
    });
    return;
  }

  try {
    const anomalies = await anomalyQueryService.getActiveAnomalies({
      gym_id:   gym_id   ? String(gym_id)   : undefined,
      severity: severity ? String(severity) : undefined,
    });
    res.json(anomalies);
  } catch (err) {
    console.error('[anomalyController] listAnomalies:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── PATCH /api/anomalies/:id/dismiss ─────────────────────────────────────────

export async function dismissAnomaly(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  try {
    const { anomaly, forbidden } = await anomalyQueryService.dismissAnomaly(id);

    if (forbidden) {
      res.status(403).json({ error: 'Critical anomalies cannot be dismissed' });
      return;
    }
    if (!anomaly) {
      res.status(404).json({
        error: 'Anomaly not found, already resolved, or already dismissed',
      });
      return;
    }

    res.json(anomaly);
  } catch (err) {
    console.error('[anomalyController] dismissAnomaly:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

