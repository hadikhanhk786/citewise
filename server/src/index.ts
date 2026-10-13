import { app } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const start = async () => {
  try {
    // Check DB connection
    await prisma.$connect();
    logger.info('Connected to database');

    app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

start();
