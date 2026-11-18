/**
 * Canonical error codes shared between Node and Python services and the UI.
 * Keep in sync with python-service/app/errors.py and src/lib/error-messages.ts.
 */
export const ERROR_CODES = {
  // PDF
  PDF_UNSUPPORTED_TYPE: 'PDF_UNSUPPORTED_TYPE',
  PDF_EMPTY_FILE: 'PDF_EMPTY_FILE',
  PDF_PARSE_FAILED: 'PDF_PARSE_FAILED',
  PDF_TOO_LARGE: 'PDF_TOO_LARGE',

  // AI pipeline
  EMBEDDING_FAILED: 'EMBEDDING_FAILED',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_FAILED: 'LLM_FAILED',
  AI_SERVICE_DOWN: 'AI_SERVICE_DOWN',

  // Chat
  CHAT_NO_CONTEXT: 'CHAT_NO_CONTEXT',
  CHAT_FAILED: 'CHAT_FAILED',

  // Infra
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

type Friendly = { message: string; hint?: string; status: number };

export const ERROR_MESSAGES: Record<string, Friendly> = {
  PDF_UNSUPPORTED_TYPE: {
    message: 'Only PDF files are supported here.',
    hint: 'Upload a file ending in .pdf.',
    status: 400,
  },
  PDF_EMPTY_FILE: {
    message: 'This file appears to be empty.',
    hint: 'Upload a file with readable text.',
    status: 400,
  },
  PDF_PARSE_FAILED: {
    message: "We couldn't read this PDF.",
    hint: 'The file may be scanned or corrupted. Try a different PDF.',
    status: 422,
  },
  PDF_TOO_LARGE: {
    message: 'This file is too large.',
    hint: 'Please upload a PDF under 5 MB.',
    status: 413,
  },
  EMBEDDING_FAILED: {
    message: "We couldn't process your content right now.",
    hint: 'Please try again shortly.',
    status: 502,
  },
  LLM_TIMEOUT: {
    message: 'The assistant took too long to respond.',
    hint: 'Please try again.',
    status: 504,
  },
  LLM_FAILED: {
    message: 'Something went wrong while generating the answer.',
    hint: 'Please try again.',
    status: 502,
  },
  AI_SERVICE_DOWN: {
    message: 'Our AI service is temporarily unavailable.',
    hint: 'Please try again in a few moments.',
    status: 503,
  },
  CHAT_NO_CONTEXT: {
    message: "I couldn't find an answer from your sources.",
    hint: 'Try rephrasing or adding more sources.',
    status: 200,
  },
  CHAT_FAILED: {
    message: 'Something went wrong. Please try again.',
    status: 500,
  },
  DB_UNAVAILABLE: {
    message: "We're having trouble reaching the database.",
    hint: 'Please try again shortly.',
    status: 503,
  },
  VALIDATION_ERROR: {
    message: 'Some fields look incorrect.',
    hint: 'Please check your input and try again.',
    status: 422,
  },
  NOT_FOUND: { message: 'Not found.', status: 404 },
  BAD_REQUEST: { message: 'Invalid request.', status: 400 },
  INTERNAL_SERVER_ERROR: {
    message: 'Something went wrong on our side.',
    hint: 'Please try again in a moment.',
    status: 500,
  },
};

export function friendly(code: string): Friendly {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES['INTERNAL_SERVER_ERROR']!;
}
