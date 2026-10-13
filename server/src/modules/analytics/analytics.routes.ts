import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middleware/auth';
import { checkWorkspace } from '../../middleware/workspace';

const router = Router();

router.use(authenticate);
router.use(checkWorkspace);

router.get('/dashboard', analyticsController.getDashboard);
router.get('/insights', analyticsController.getInsights);

export const analyticsRoutes = router;
