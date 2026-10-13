import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('1d'),
  PY_AI_BASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default('*'),
});

export const env = envSchema.parse(process.env);
