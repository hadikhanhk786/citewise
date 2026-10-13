import { Router } from 'express';
import { aiClient } from '../../clients/aiClient';
import { prisma } from '../../lib/prisma';

const router = Router();

router.get('/', async (req, res) => {
  const [pythonHealth, dbHealth] = await Promise.allSettled([
    aiClient.get('/health', { timeout: 3000 }),
    prisma.$queryRaw`SELECT 1`
  ]);

  const pythonStatus = pythonHealth.status === 'fulfilled' && pythonHealth.value.data?.status === 'ok' ? 'ok' : 'down';
  const dbStatus = dbHealth.status === 'fulfilled' ? 'ok' : 'down';

  const apiStatus = (pythonStatus === 'ok' && dbStatus === 'ok') ? 'ok' : 'degraded';

  res.json({
    status: apiStatus,
    timestamp: new Date().toISOString(),
    services: {
      api: 'ok',
      db: dbStatus,
      ai: pythonStatus,
    },
  });
});

export const healthRoutes = router;
