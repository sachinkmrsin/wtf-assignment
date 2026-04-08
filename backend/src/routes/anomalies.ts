import { Router } from 'express';
import { listAnomalies, dismissAnomaly } from '../controllers/anomalyController';

const router = Router();

// GET /api/anomalies?gym_id=&severity= — active anomalies across all gyms, newest first
router.get('/', listAnomalies);

// PATCH /api/anomalies/:id/dismiss — dismiss a warning-level anomaly (403 if critical)
router.patch('/:id/dismiss', dismissAnomaly);

export default router;
