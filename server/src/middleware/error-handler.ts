import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { friendly, ERROR_CODES } from '../lib/error-codes';
import { logError } from '../services/errorLog.service';
import { env } from '../config/env';

// Local until Prisma generate picks up the new enum.
type ErrorSourceType = 'PDF' | 'YOUTUBE' | 'NOTES' | 'CHAT' | 'SYSTEM';

export class AppError extends Error {
  statusCode: number;
  code: string;
  hint?: string;
  details?: Record<string, unknown>;
  sourceType?: ErrorSourceType;
  sourceId?: string;
  workspaceId?: string;

  constructor(
    codeOrMessage: string,
    optsOrStatus:
      | number
      | {
          message?: string;
          statusCode?: number;
          hint?: string;
          details?: Record<string, unknown>;
          sourceType?: ErrorSourceType;
          sourceId?: string;
          workspaceId?: string;
        } = {},
    legacyCode?: string,
  ) {
    // Legacy call: new AppError(message, statusCode, code?)
    if (typeof optsOrStatus === 'number') {
      super(codeOrMessage);
      this.name = 'AppError';
      this.code = legacyCode ?? ERROR_CODES.INTERNAL_SERVER_ERROR;
      this.statusCode = optsOrStatus;
      Error.captureStackTrace(this, this.constructor);
      return;
    }

    // New call: new AppError(code, { ...opts })
    const f = friendly(codeOrMessage);
    super(optsOrStatus.message ?? f.message);
    this.name = 'AppError';
    this.code = codeOrMessage;
    this.statusCode = optsOrStatus.statusCode ?? f.status;
    this.hint = optsOrStatus.hint ?? f.hint;
    this.details = optsOrStatus.details;
    this.sourceType = optsOrStatus.sourceType;
    this.sourceId = optsOrStatus.sourceId;
    this.workspaceId = optsOrStatus.workspaceId;
    Error.captureStackTrace(this, this.constructor);
  }
}

function inferSourceType(endpoint: string): ErrorSourceType {
  if (endpoint.includes('/sources/youtube')) return 'YOUTUBE';
  if (endpoint.includes('/sources/pdf')) return 'PDF';
  if (endpoint.includes('/sources/notes')) return 'NOTES';
  if (endpoint.includes('/chat')) return 'CHAT';
  return 'SYSTEM';
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const requestId = (req.id as string) ?? (req.headers['x-request-id'] as string) ?? undefined;
  const endpoint = req.originalUrl || req.url;

  let statusCode = 500;
  let code: string = ERROR_CODES.INTERNAL_SERVER_ERROR;
  let message = 'Something went wrong on our side.';
  let hint: string | undefined;
  let details: Record<string, unknown> | undefined;
  let sourceType: ErrorSourceType = inferSourceType(endpoint);
  let sourceId: string | undefined;
  let workspaceId: string | undefined =
    req.body?.workspaceId || (req.query?.workspaceId as string) || (req.params as any)?.workspaceId;

  if (err instanceof ZodError) {
    statusCode = 422;
    code = ERROR_CODES.VALIDATION_ERROR;
    const f = friendly(code);
    message = f.message;
    hint = f.hint;
    details = { issues: err.issues };
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    hint = err.hint;
    details = err.details;
    if (err.sourceType) sourceType = err.sourceType;
    if (err.sourceId) sourceId = err.sourceId;
    if (err.workspaceId) workspaceId = err.workspaceId;
  } else if (err instanceof Error) {
    message = friendly(code).message;
  }

  if (statusCode >= 500) {
    logger.error({ err, requestId, endpoint, code }, 'Unhandled error');
  } else {
    logger.warn({ err, requestId, endpoint, code }, 'Handled error');
  }

  // Persist to error_logs (fire and forget; never throws)
  void logError({
    workspaceId,
    sourceType,
    sourceId,
    endpoint,
    errorCode: code,
    message,
    hint,
    requestId,
    metadata: {
      method: req.method,
      userId: (req as any).user?.id,
      ...(details ? { details } : {}),
    },
    stack: err instanceof Error ? err.stack : null,
  });

  const body: any = {
    error: {
      code,
      message,
      ...(hint ? { hint } : {}),
      requestId,
      ...(details ? { details } : {}),
    },
  };

  if (env.NODE_ENV !== 'production' && err instanceof Error && !(err instanceof AppError)) {
    body.error.details = { ...(body.error.details ?? {}), debug: err.message };
  }

  res.status(statusCode).json(body);
};
