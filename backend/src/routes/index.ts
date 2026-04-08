import { Router } from 'express';

import gymsRouter from './gyms';
import membersRouter from './members';
import analyticsRouter from './analytics';
import anomaliesRouter from './anomalies';
import simulatorRouter from './simulator';

const router = Router();

router.use('/gyms', gymsRouter);
router.use('/members', membersRouter);
router.use('/analytics', analyticsRouter);
router.use('/anomalies', anomaliesRouter);
router.use('/simulator', simulatorRouter);

export default router;
