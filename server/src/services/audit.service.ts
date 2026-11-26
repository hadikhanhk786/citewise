import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export const auditService = {
  async log(workspaceId: string, userId: string, action: string, metadata?: Prisma.InputJsonValue) {
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action,
          metadata: metadata || {},
        },
      });
    } catch (error) {
      // Audit logging should not fail the request
      logger.error({ error, workspaceId, userId, action }, 'Failed to write audit log');
    }
  },
};
