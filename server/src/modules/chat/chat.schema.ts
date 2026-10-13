import { z } from 'zod';

const CHAT_MODES = ['HYBRID', 'YOUTUBE', 'PDF', 'NOTES'] as const;

export const createSessionSchema = z.object({
  body: z.object({
    workspaceId: z.string().uuid(),
    mode: z.enum(CHAT_MODES).default('HYBRID'),
    title: z.string().min(1).optional(),
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1),
    mode: z.enum(CHAT_MODES).default('HYBRID'),
    strictSources: z.boolean().optional(),
  }),
});

export const listSessionsSchema = z.object({
  query: z.object({
    workspaceId: z.string().uuid(),
  }),
});

export const getMessagesSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});
