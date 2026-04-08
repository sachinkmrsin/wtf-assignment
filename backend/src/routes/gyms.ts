import { Router } from 'express';
import {
  listGyms,
  getLiveSnapshot,
  getAnalytics,
} from '../controllers/gymController';

const router = Router();

// GET /api/gyms — list all gyms with current occupancy and today's revenue
router.get('/', listGyms);

// GET /api/gyms/:id/live — live snapshot (occupancy, revenue, recent events, active anomalies)
router.get('/:id/live', getLiveSnapshot);

// GET /api/gyms/:id/analytics?dateRange=7d|30d|90d — peak heatmap, revenue by plan, churn, ratio
router.get('/:id/analytics', getAnalytics);

export default router;
