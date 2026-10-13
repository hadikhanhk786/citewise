import request from 'supertest';
import { app } from '../app';

// ── Mocks ──────────────────────────────────────────────────────────────

jest.mock('../clients/aiClient', () => ({
  aiClient: { post: jest.fn(), get: jest.fn() },
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    chatSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    chatMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
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
const SESSION_ID = '00000000-0000-4000-a000-000000000020';
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

// ── Tests: Create Session ──────────────────────────────────────────────

describe('POST /api/chat/sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should create a chat session and return 201', async () => {
    const mockSession = {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      userId: 'user-1',
      mode: 'HYBRID',
      title: 'New Chat',
      createdAt: new Date().toISOString(),
    };

    (prisma.chatSession.create as jest.Mock).mockResolvedValue(mockSession);

    const res = await authed(
      request(app)
        .post('/api/chat/sessions')
        .send({ workspaceId: WORKSPACE_ID, mode: 'HYBRID' })
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: SESSION_ID,
      mode: 'HYBRID',
      title: 'New Chat',
    });
  });

  it('should return 422 for missing workspaceId', async () => {
    const res = await authed(
      request(app)
        .post('/api/chat/sessions')
        .send({ mode: 'HYBRID' })
    );

    expect([400, 422]).toContain(res.status);
  });

  it('should return 401 without auth', async () => {
    const res = await request(app)
      .post('/api/chat/sessions')
      .send({ workspaceId: WORKSPACE_ID });

    expect(res.status).toBe(401);
  });
});

// ── Tests: List Sessions ───────────────────────────────────────────────

describe('GET /api/chat/sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should return sessions for the workspace', async () => {
    const mockSessions = [
      {
        id: SESSION_ID,
        workspaceId: WORKSPACE_ID,
        userId: 'user-1',
        mode: 'HYBRID',
        title: 'Chat 1',
        createdAt: new Date().toISOString(),
      },
    ];

    (prisma.chatSession.findMany as jest.Mock).mockResolvedValue(mockSessions);

    const res = await authed(
      request(app).get(`/api/chat/sessions?workspaceId=${WORKSPACE_ID}`)
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });
});

// ── Tests: Send Message ────────────────────────────────────────────────

describe('POST /api/chat/sessions/:id/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should send a message and return user + assistant messages', async () => {
    // Mock session ownership
    (prisma.chatSession.findUnique as jest.Mock).mockResolvedValue({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      userId: 'user-1',
      mode: 'HYBRID',
    });

    const userMsg = {
      id: 'msg-1',
      sessionId: SESSION_ID,
      sender: 'USER',
      content: 'What is RAG?',
      createdAt: new Date().toISOString(),
    };

    const assistantMsg = {
      id: 'msg-2',
      sessionId: SESSION_ID,
      sender: 'ASSISTANT',
      content: 'RAG stands for Retrieval Augmented Generation.',
      citations: [
        {
          sourceType: 'YOUTUBE',
          title: 'RAG Tutorial',
          sourceId: 'abc123',
          docId: 'abc123',
          timestampStart: '0:00',
          timestampEnd: '0:04',
          snippet: 'welcome to this tutorial on building a RAG system',
        },
      ],
      createdAt: new Date().toISOString(),
    };

    let createCallCount = 0;
    (prisma.chatMessage.create as jest.Mock).mockImplementation(() => {
      createCallCount++;
      return Promise.resolve(createCallCount === 1 ? userMsg : assistantMsg);
    });

    // Mock Python RAG response
    (aiClient.post as jest.Mock).mockResolvedValue({
      data: {
        answer: 'RAG stands for Retrieval Augmented Generation.',
        citations: [
          {
            sourceType: 'YOUTUBE',
            title: 'RAG Tutorial',
            sourceId: 'abc123',
            docId: 'abc123',
            timestampStart: '0:00',
            timestampEnd: '0:04',
            snippet: 'welcome to this tutorial on building a RAG system',
          },
        ],
      },
    });

    const res = await authed(
      request(app)
        .post(`/api/chat/sessions/${SESSION_ID}/messages`)
        .send({ content: 'What is RAG?', mode: 'HYBRID' })
    );

    expect(res.status).toBe(200);
    expect(res.body.userMessage).toBeDefined();
    expect(res.body.assistantMessage).toBeDefined();
    expect(res.body.userMessage.sender).toBe('USER');
    expect(res.body.assistantMessage.sender).toBe('ASSISTANT');
    expect(res.body.assistantMessage.citations).toHaveLength(1);
    expect(res.body.assistantMessage.citations[0].sourceType).toBe('YOUTUBE');

    // Verify Python service was called with correct payload
    expect(aiClient.post).toHaveBeenCalledWith('/rag/chat', {
      workspaceId: WORKSPACE_ID,
      mode: 'HYBRID',
      strictSources: false,
      message: 'What is RAG?',
      topK: 6,
    });
  });

  it('should return 422 for empty message content', async () => {
    const res = await authed(
      request(app)
        .post(`/api/chat/sessions/${SESSION_ID}/messages`)
        .send({ content: '', mode: 'HYBRID' })
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 404 when session does not exist', async () => {
    (prisma.chatSession.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await authed(
      request(app)
        .post(`/api/chat/sessions/${SESSION_ID}/messages`)
        .send({ content: 'Hello', mode: 'HYBRID' })
    );

    expect(res.status).toBe(404);
  });

  it('should return 404 when session belongs to another user', async () => {
    (prisma.chatSession.findUnique as jest.Mock).mockResolvedValue({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      userId: 'other-user',
      mode: 'HYBRID',
    });

    const res = await authed(
      request(app)
        .post(`/api/chat/sessions/${SESSION_ID}/messages`)
        .send({ content: 'Hello', mode: 'HYBRID' })
    );

    expect(res.status).toBe(404);
  });

  it('should propagate error when Python service is down', async () => {
    (prisma.chatSession.findUnique as jest.Mock).mockResolvedValue({
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      userId: 'user-1',
      mode: 'HYBRID',
    });

    (prisma.chatMessage.create as jest.Mock).mockResolvedValue({
      id: 'msg-1',
      sessionId: SESSION_ID,
      sender: 'USER',
      content: 'Hello',
    });

    (aiClient.post as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Python service unavailable'), {
        statusCode: 502,
        name: 'AppError',
      })
    );

    const res = await authed(
      request(app)
        .post(`/api/chat/sessions/${SESSION_ID}/messages`)
        .send({ content: 'Hello', mode: 'HYBRID' })
    );

    expect(res.status).toBe(500);
  });
});

// ── Tests: Get Messages ────────────────────────────────────────────────

describe('GET /api/chat/sessions/:id/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthAndWorkspace();
  });

  it('should return messages for a valid session', async () => {
    (prisma.chatSession.findUnique as jest.Mock).mockResolvedValue({
      id: SESSION_ID,
      userId: 'user-1',
    });

    const mockMessages = [
      { id: 'msg-1', sender: 'USER', content: 'Hi', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'msg-2', sender: 'ASSISTANT', content: 'Hello!', citations: [], createdAt: '2025-01-01T00:00:01Z' },
    ];
    (prisma.chatMessage.findMany as jest.Mock).mockResolvedValue(mockMessages);

    const res = await authed(
      request(app).get(`/api/chat/sessions/${SESSION_ID}/messages`)
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].sender).toBe('USER');
    expect(res.body[1].sender).toBe('ASSISTANT');
  });

  it('should return 404 for session owned by another user', async () => {
    (prisma.chatSession.findUnique as jest.Mock).mockResolvedValue({
      id: SESSION_ID,
      userId: 'other-user',
    });

    const res = await authed(
      request(app).get(`/api/chat/sessions/${SESSION_ID}/messages`)
    );

    expect(res.status).toBe(404);
  });
});
