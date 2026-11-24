import { prisma } from '../../lib/prisma';
import { aiClient } from '../../clients/aiClient';
import { AppError } from '../../middleware/error-handler';
import { logger } from '../../lib/logger';
import { ChatMode } from '@prisma/client';
import { ERROR_CODES, friendly } from '../../lib/error-codes';
import { logError } from '../../services/errorLog.service';
import { requestContext } from '../../lib/context';

export const chatService = {
  async createSession(workspaceId: string, userId: string, mode: ChatMode = 'HYBRID', title?: string) {
    return prisma.chatSession.create({
      data: {
        workspaceId,
        userId,
        mode,
        title: title || 'New Chat',
      },
    });
  },

  async listSessions(workspaceId: string, userId: string) {
    return prisma.chatSession.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  async getSessionMessages(sessionId: string, userId: string) {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, { message: 'Session not found', statusCode: 404 });
    }

    return prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async sendMessage(
    sessionId: string,
    userId: string,
    content: string,
    mode: ChatMode = 'HYBRID',
    strictSources: boolean = false,
    sourceIds?: string[],
  ) {
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });

    if (!session || session.userId !== userId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, { message: 'Session not found', statusCode: 404 });
    }

    // 1. Save user message
    const userMessage = await prisma.chatMessage.create({
      data: { sessionId, sender: 'USER', content },
    });

    try {
      const payload: Record<string, unknown> = {
        workspaceId: session.workspaceId,
        mode,
        strictSources,
        message: content,
        topK: 6,
      };
      if (sourceIds && sourceIds.length > 0) {
        payload.filters = { sourceIds };
      }
      const response = await aiClient.post('/rag/chat', payload);

      const { answer, citations } = response.data;

      await prisma.chatMessage.create({
        data: {
          sessionId,
          sender: 'ASSISTANT',
          content: answer,
          citations: citations || [],
        },
      });

      return { userMessage, assistantMessage };
    } catch (error) {
      const code = error instanceof AppError ? error.code : ERROR_CODES.CHAT_FAILED;
      const f = friendly(code);
      const fallback = error instanceof AppError ? error.message : f.message;

      logger.error(
        { err: error, sessionId, userId, mode, event: 'CHAT_RAG_FAILED', code },
        'RAG chat request failed',
      );

      await logError({
        workspaceId: session.workspaceId,
        sourceType: 'CHAT',
        sourceId: sessionId,
        endpoint: '/api/chat',
        errorCode: code,
        message: fallback,
        hint: error instanceof AppError ? error.hint : f.hint,
        requestId: requestContext.getStore()?.requestId,
        metadata: { mode, strictSources, userId },
        stack: error instanceof Error ? error.stack : null,
      });

      // Persist an assistant fallback message so the chat thread stays coherent.
      const assistantMessage = await prisma.chatMessage.create({
        data: {
          sessionId,
          sender: 'ASSISTANT',
          content: fallback,
          citations: [{ error: true, code }] as any,
        },
      });

      // Re-throw so the HTTP layer still returns an error envelope. The
      // fallback message is already persisted and will appear on next fetch.
      throw error;
    }
  },
};
