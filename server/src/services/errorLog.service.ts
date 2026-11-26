import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { env } from '../config/env';

// Local type until Prisma client regen exposes the ErrorSourceType enum.
type ErrorSourceType = 'PDF' | 'NOTES' | 'CHAT' | 'SYSTEM';

interface LogErrorArgs {
  workspaceId?: string | null;
  sourceType: ErrorSourceType;
  sourceId?: string | null;
  endpoint: string;
  errorCode: string;
  message: string;
  hint?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
  stack?: string | null;
}

/**
 * Persist an error to the error_logs table. Never throws — a failing logger
 * must not mask the original error.
 */
export async function logError(args: LogErrorArgs): Promise<void> {
  try {
    const inDev = env.NODE_ENV !== 'production';
    await prisma.errorLog.create({
      data: {
        workspaceId: args.workspaceId ?? null,
        sourceType: args.sourceType,
        sourceId: args.sourceId ?? null,
        endpoint: args.endpoint,
        errorCode: args.errorCode,
        message: args.message,
        hint: args.hint ?? null,
        requestId: args.requestId ?? null,
        metadata: (args.metadata ?? {}) as Prisma.InputJsonObject,
        stackTrace: inDev ? args.stack ?? null : null,
      },
    });
  } catch (err) {
    logger.error({ err, original: args }, 'Failed to persist error_log');
  }
}
