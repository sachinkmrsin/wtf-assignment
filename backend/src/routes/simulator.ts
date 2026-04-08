import { Router } from 'express';
import {
  startSimulation,
  stopSimulation,
  resetSimulation,
  getStatus,
} from '../controllers/simulatorController';

const router = Router();

// POST /api/simulator/start  — body: { speed: 1 | 5 | 10 }
router.post('/start', startSimulation);

// POST /api/simulator/stop
router.post('/stop', stopSimulation);

// POST /api/simulator/reset — clears open check-ins, preserves history
router.post('/reset', resetSimulation);

// GET  /api/simulator/status — current state (bonus)
router.get('/status', getStatus);

export default router;

