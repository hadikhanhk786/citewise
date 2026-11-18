import type { AxiosError } from 'axios';

/**
 * Standard error envelope returned by the Node API:
 * { error: { code, message, hint?, requestId, details? } }
 */
export interface ApiError {
  code: string;
  message: string;
  hint?: string;
  requestId?: string;
  details?: Record<string, unknown>;
  status?: number;
}

// Fallback friendly messages keyed by code. The backend already returns
// friendly messages, but we keep this map so that network failures and
// unknown codes still render something useful.
const FALLBACK: Record<string, { message: string; hint?: string }> = {
  PDF_UNSUPPORTED_TYPE: {
    message: 'Only PDF files are supported here.',
    hint: 'Upload a file ending in .pdf.',
  },
  PDF_EMPTY_FILE: {
    message: 'This file appears to be empty.',
    hint: 'Upload a file with readable text.',
  },
  EMBEDDING_FAILED: {
    message: "We couldn't process your content right now.",
    hint: 'Please try again shortly.',
  },
  AI_SERVICE_DOWN: {
    message: 'Our AI service is temporarily unavailable.',
    hint: 'Please try again in a few moments.',
  },
  NETWORK_ERROR: {
    message: "We couldn't reach the server.",
    hint: 'Check your connection and try again.',
  },
  UNKNOWN: {
    message: 'Something went wrong. Please try again.',
  },
};

export function parseApiError(err: unknown): ApiError {
  const ax = err as AxiosError<{ error?: ApiError }>;

  if (ax?.isAxiosError) {
    if (!ax.response) {
      const f = FALLBACK.NETWORK_ERROR!;
      return { code: 'NETWORK_ERROR', message: f.message, hint: f.hint };
    }
    const env = ax.response.data?.error;
    if (env && env.code) {
      return { ...env, status: ax.response.status };
    }
    const f = FALLBACK.UNKNOWN!;
    return {
      code: 'UNKNOWN',
      message: f.message,
      hint: f.hint,
      status: ax.response.status,
    };
  }

  if (err instanceof Error) {
    return { code: 'UNKNOWN', message: err.message || FALLBACK.UNKNOWN!.message };
  }
  return { code: 'UNKNOWN', message: FALLBACK.UNKNOWN!.message };
}
