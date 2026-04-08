import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { crossGymRevenue } from '../controllers/analyticsController';

const router = Router();

// GET /api/analytics/cross-gym — revenue comparison last 30 days (< 2ms target)
// NOTE: must be defined BEFORE any param-based routes to avoid route conflicts
router.get('/cross-gym', crossGymRevenue);

// GET /api/analytics/revenue/comparison — alias used by the frontend
// NOTE: must be defined BEFORE /revenue/:gymId to prevent "comparison" being
//       captured as a gymId param and sent to PostgreSQL as a UUID
router.get('/revenue/comparison', crossGymRevenue);

// ── Legacy routes (kept for backward compatibility) ───────────────────────────

// GET /api/analytics/occupancy/:gymId
router.get('/occupancy/:gymId', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count
       FROM checkins
       WHERE gym_id = $1 AND checked_out IS NULL`,
      [req.params.gymId],
    );
    res.json({ gymId: req.params.gymId, count: parseInt(rows[0].count) });
  } catch (err) {
    console.error('[analytics] GET /occupancy/:gymId', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/revenue/:gymId
router.get('/revenue/:gymId', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE gym_id = $1 AND paid_at >= CURRENT_DATE`,
      [req.params.gymId],
    );
    res.json({ gymId: req.params.gymId, total: parseFloat(rows[0].total) });
  } catch (err) {
    console.error('[analytics] GET /revenue/:gymId', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/heatmap/:gymId
router.get('/heatmap/:gymId', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT gym_id,
              day_of_week,
              hour_of_day,
              checkin_count::INTEGER AS total_checkins
       FROM gym_hourly_stats
       WHERE gym_id = $1
       ORDER BY day_of_week, hour_of_day`,
      [req.params.gymId],
    );
    res.json(rows);
  } catch (err) {
    console.error('[analytics] GET /heatmap/:gymId', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/checkins/:gymId?days=7
router.get('/checkins/:gymId', async (req: Request, res: Response) => {
  try {
    const days = parseInt((req.query.days as string) ?? '7');
    const { rows } = await pool.query(
      `SELECT
         DATE_TRUNC('day', checked_in) AS day,
         COUNT(*) AS count
       FROM checkins
       WHERE gym_id = $1
         AND checked_in >= NOW() - ($2 || ' days')::INTERVAL
       GROUP BY day
       ORDER BY day`,
      [req.params.gymId, days],
    );
    res.json(rows);
  } catch (err) {
    console.error('[analytics] GET /checkins/:gymId', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
