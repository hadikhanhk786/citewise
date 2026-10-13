
import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { AppError } from '../middleware/error-handler';
import { ERROR_CODES, friendly } from '../lib/error-codes';
import { requestContext } from '../lib/context';

// Add custom types for axios config
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: { startTime: number };
    __isRetryRequest?: boolean;
  }
}

export const aiClient = axios.create({
  baseURL: env.PY_AI_BASE_URL,
  timeout: 45000, // 45s
});

aiClient.interceptors.request.use((config) => {
  const store = requestContext.getStore();
  if (store?.requestId) {
    config.headers['X-Request-ID'] = store.requestId;
  }
  config.metadata = { startTime: Date.now() };
  return config;
});

aiClient.interceptors.response.use(
  (response) => {
    const duration = Date.now() - (response.config.metadata?.startTime || Date.now());
    logger.info({
      type: 'DOWNSTREAM_API',
      target: 'Python_RAG_Service',
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status,
      durationMs: duration
    }, 'Python proxy interaction successful');
    return response;
  },
  async (error) => {
    const config = error.config;
    
    // Retry logic for 5xx or network errors (once)
    if (config && !config.__isRetryRequest && (
        !error.response || 
        (error.response.status >= 502 && error.response.status <= 504) ||
        error.code === 'ECONNREFUSED'
    )) {
      config.__isRetryRequest = true;
      logger.warn(`Retrying AI Service request: ${config.url}`);
      return aiClient(config);
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.error('Python AI service unreachable');
      return Promise.reject(new AppError(ERROR_CODES.AI_SERVICE_DOWN));
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return Promise.reject(new AppError(ERROR_CODES.LLM_TIMEOUT));
    }

    if (error.response) {
      const duration = Date.now() - (config?.metadata?.startTime || Date.now());
      logger.warn({
        type: 'DOWNSTREAM_API_ERROR',
        target: 'Python_RAG_Service',
        method: config?.method?.toUpperCase(),
        url: config?.url,
        status: error.response.status,
        durationMs: duration,
        responseBody: error.response.data,
      }, 'Python proxy interaction failed');

      // Python returns { error: { code, message, hint, details } } or legacy { detail }
      const body = error.response.data ?? {};
      const pyErr = body.error ?? {};
      const code = pyErr.code || ERROR_CODES.AI_SERVICE_DOWN;
      const f = friendly(code);
      return Promise.reject(
        new AppError(code, {
          statusCode: error.response.status || f.status,
          message: f.message, // map to friendly message, ignore raw python text
          hint: f.hint,
          details: pyErr.details,
        }),
      );
    }
    
    logger.error({ err: error, type: 'DOWNSTREAM_API_FATAL' }, 'Python proxy literal stack exception');
    return Promise.reject(error);
  }
);
