import request from 'supertest';
import { app } from '../app';

// ── Mocks ──────────────────────────────────────────────────────────────

jest.mock('../clients/aiClient', () => ({
  aiClient: { post: jest.fn(), get: jest.fn() },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    source: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    youTubeVideo: { upsert: jest.fn() },
    notesCollection: { upsert: jest.fn() },
    pdfDocument: { upsert: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    errorLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ userId: 'user-1', role: 'MEMBER' })),
}));

import { aiClient } from '../clients/aiClient';
import { prisma } from '../lib/prisma';

// ── Helpers ────────────────────────────────────────────────────────────

const WORKSPACE_ID = '00000000-0000-4000-a000-000000000001';
const SOURCE_ID = '00000000-0000-4000-a000-000000000010';
const AUTH_HEADER = 'Bearer test-jwt-token';

function authed(req: request.Test) {
  return req.set('Authorization', AUTH_HEADER);
}

function mockAuthAndWorkspace() {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    id: 'user-1',
    email: 'test@example.com',
    role: 'MEMBER',
  });
  (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue({
    workspaceId: WORKSPACE_ID,
    userId: 'user-1',
    role: 'MEMBER',
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('POST /api/sources/youtube', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should create a source with INDEXING status and return 201', async () => {
    const mockSource = {
      id: SOURCE_ID,
      workspaceId: WORKSPACE_ID,
      type: 'YOUTUBE',
      title: 'https://www.youtube.com/watch?v=abc123',
      status: 'INDEXING',
      createdAt: new Date().toISOString(),
    };

    (prisma.source.create as jest.Mock).mockResolvedValue(mockSource);
    // Fire-and-forget ingestion — mock the Python call
    (aiClient.post as jest.Mock).mockResolvedValue({
      data: { videoId: 'abc123', title: 'Test Video', chunksIndexed: 5 },
    });

    const res = await authed(
      request(app)
        .post('/api/sources/youtube')
        .send({ workspaceId: WORKSPACE_ID, url: 'https://www.youtube.com/watch?v=abc123' })
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: SOURCE_ID,
      type: 'YOUTUBE',
      status: 'INDEXING',
    });
    expect(prisma.source.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          type: 'YOUTUBE',
          status: 'INDEXING',
        }),
      })
    );
  });

  it('should return 422 for invalid URL', async () => {
    const res = await authed(
      request(app)
        .post('/api/sources/youtube')
        .send({ workspaceId: WORKSPACE_ID, url: 'not-a-valid-url' })
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 422 for missing workspaceId', async () => {
    const res = await authed(
      request(app)
        .post('/api/sources/youtube')
        .send({ url: 'https://www.youtube.com/watch?v=abc123' })
    );

    // Either 422 (Zod) or 400 (workspace middleware) depending on middleware order
    expect([400, 422]).toContain(res.status);
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/sources/youtube')
      .send({ workspaceId: WORKSPACE_ID, url: 'https://www.youtube.com/watch?v=abc123' });

    expect(res.status).toBe(401);
  });

  it('should return 403 when user is not workspace member', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      role: 'MEMBER',
    });
    (prisma.workspaceMember.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await authed(
      request(app)
        .post('/api/sources/youtube')
        .send({ workspaceId: WORKSPACE_ID, url: 'https://www.youtube.com/watch?v=abc123' })
    );

    expect(res.status).toBe(403);
  });
});

describe('POST /api/sources/notes/upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should create a notes source and return 201', async () => {
    const mockSource = {
      id: SOURCE_ID,
      workspaceId: WORKSPACE_ID,
      type: 'NOTES',
      title: 'sample-notes.md',
      status: 'INDEXING',
      createdAt: new Date().toISOString(),
    };

    (prisma.source.create as jest.Mock).mockResolvedValue(mockSource);
    (aiClient.post as jest.Mock).mockResolvedValue({
      data: { filename: 'sample-notes.md', chunksIndexed: 3 },
    });

    const res = await authed(
      request(app)
        .post('/api/sources/notes/upload')
        .field('workspaceId', WORKSPACE_ID)
        .attach('file', Buffer.from('# Test Notes\n\nSome content here.'), 'sample-notes.md')
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: SOURCE_ID,
      type: 'NOTES',
      status: 'INDEXING',
    });
  });

  it('should return 400 when no file is attached', async () => {
    const res = await authed(
      request(app)
        .post('/api/sources/notes/upload')
        .field('workspaceId', WORKSPACE_ID)
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.message).toBe('No file uploaded');
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/sources/notes/upload')
      .field('workspaceId', WORKSPACE_ID)
      .attach('file', Buffer.from('content'), 'notes.md');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/sources/pdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should create a PDF source and return 201', async () => {
    const mockSource = {
      id: SOURCE_ID,
      workspaceId: WORKSPACE_ID,
      type: 'PDF',
      title: 'sample.pdf',
      status: 'INDEXING',
      createdAt: new Date().toISOString(),
    };

    (prisma.source.create as jest.Mock).mockResolvedValue(mockSource);
    (aiClient.post as jest.Mock).mockResolvedValue({
      data: { filename: 'sample.pdf', pages: 3, chunksIndexed: 7 },
    });

    const res = await authed(
      request(app)
        .post('/api/sources/pdf')
        .field('workspaceId', WORKSPACE_ID)
        .attach('file', Buffer.from('%PDF-1.4 fake pdf bytes'), 'sample.pdf')
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: SOURCE_ID,
      type: 'PDF',
      status: 'INDEXING',
    });
  });

  it('should return 400 when no file is attached', async () => {
    const res = await authed(
      request(app)
        .post('/api/sources/pdf')
        .field('workspaceId', WORKSPACE_ID)
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('should return 400 for non-PDF file extension', async () => {
    const res = await authed(
      request(app)
        .post('/api/sources/pdf')
        .field('workspaceId', WORKSPACE_ID)
        .attach('file', Buffer.from('not a pdf'), 'notes.txt')
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PDF_UNSUPPORTED_TYPE');
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/sources/pdf')
      .field('workspaceId', WORKSPACE_ID)
      .attach('file', Buffer.from('%PDF-1.4'), 'sample.pdf');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/sources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should list sources for the workspace', async () => {
    const mockSources = [
      {
        id: SOURCE_ID,
        workspaceId: WORKSPACE_ID,
        type: 'YOUTUBE',
        title: 'Test Video',
        status: 'READY',
        youtubeVideo: { videoId: 'abc123' },
        notesCollection: null,
        _count: { documents: 0 },
      },
    ];

    (prisma.source.findMany as jest.Mock).mockResolvedValue(mockSources);

    const res = await authed(
      request(app).get(`/api/sources?workspaceId=${WORKSPACE_ID}`)
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].type).toBe('YOUTUBE');
  });

  it('should return 422 for missing workspaceId query param', async () => {
    const res = await authed(request(app).get('/api/sources'));
    // workspace middleware returns 400 if no workspaceId
    expect([400, 422]).toContain(res.status);
  });
});

describe('DELETE /api/sources/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should delete a source and return 204', async () => {
    (prisma.source.findUnique as jest.Mock).mockResolvedValue({
      id: SOURCE_ID,
      workspaceId: WORKSPACE_ID,
    });
    (prisma.source.delete as jest.Mock).mockResolvedValue({});

    const res = await authed(
      request(app).delete(`/api/sources/${SOURCE_ID}?workspaceId=${WORKSPACE_ID}`)
    );

    expect(res.status).toBe(204);
  });

  it('should return 404 if source does not exist', async () => {
    (prisma.source.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await authed(
      request(app).delete(`/api/sources/${SOURCE_ID}?workspaceId=${WORKSPACE_ID}`)
    );

    expect(res.status).toBe(404);
  });
});
