import { z } from 'zod';

export const createYoutubeSourceSchema = z.object({
  body: z.object({
    workspaceId: z.string().uuid(),
    url: z.string().url(),
  }),
});

// For multipart uploads, workspaceId may arrive in either body or query.
// At least one must be present and a valid UUID.
const workspaceIdInBodyOrQuery = z
  .object({
    body: z.object({ workspaceId: z.string().uuid().optional() }).passthrough(),
    query: z.object({ workspaceId: z.string().uuid().optional() }).passthrough(),
  })
  .refine(
    (v) => Boolean(v.body?.workspaceId || v.query?.workspaceId),
    { message: 'workspaceId is required (body or query)', path: ['body', 'workspaceId'] }
  );

export const uploadNotesSchema = workspaceIdInBodyOrQuery;
export const uploadPdfSchema = workspaceIdInBodyOrQuery;

export const listSourcesSchema = z.object({
  query: z.object({
    workspaceId: z.string().uuid(),
  }),
});

export const deleteSourceSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const reindexSourceSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    workspaceId: z.string().uuid(),
  }),
});

export const syncNotesSchema = z.object({
  query: z.object({
    workspaceId: z.string().uuid(),
  }),
});

export const summarizeSourceSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    workspaceId: z.string().uuid(),
  }),
});
