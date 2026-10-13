import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/error-handler';
import { requestContext } from './lib/context';

// Routes
import { authRoutes } from './modules/auth/auth.routes';
import { sourcesRoutes } from './modules/sources/sources.routes';
import { chatRoutes } from './modules/chat/chat.routes';
import { healthRoutes } from './modules/health/health.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';

export const app = express();

// Security & Middleware
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());

app.use(pinoHttp({
  logger,
  genReqId: function (req, res) {
    const existingID = req.id ?? req.headers["x-request-id"];
    if (existingID) return existingID;
    const id = randomUUID();
    res.setHeader('X-Request-ID', id);
    return id;
  },
  customProps: function (req: any) {
    return {
      workspaceId: req.body?.workspaceId || req.query?.workspaceId || req.params?.workspaceId,
      userId: req.user?.id
    };
  }
}));

app.use((req, res, next) => {
  requestContext.run({ requestId: req.id as string }, next);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/analytics', analyticsRoutes);
// app.use('/api/health', healthRoutes);
// app.use('/api/health', healthRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global Error Handler
app.use(errorHandler);
