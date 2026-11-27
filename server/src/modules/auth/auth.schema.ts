import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2),
    invite: z.string().min(1),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

export const createInviteSchema = z.object({
  body: z.object({
    email: z.string().email(),
    days: z.number().int().min(1).max(90).optional(),
  }),
});
