import { prisma } from '../../lib/prisma';
import { aiClient } from '../../clients/aiClient';
import { AppError } from '../../middleware/error-handler';
import { logger } from '../../lib/logger';
import { ERROR_CODES, friendly } from '../../lib/error-codes';
import { logError } from '../../services/errorLog.service';
import { requestContext } from '../../lib/context';

// Kept local until `prisma generate` picks up the new ErrorSourceType enum.
type ErrorSourceType = 'PDF' | 'NOTES' | 'CHAT' | 'SYSTEM';

async function markSourceErrored(
  sourceId: string,
  workspaceId: string,
  sourceType: ErrorSourceType,
  endpoint: string,
  err: unknown,
  metadata: Record<string, unknown>,
) {
  const code = err instanceof AppError ? err.code : ERROR_CODES.EMBEDDING_FAILED;
  const f = friendly(code);
  const message = err instanceof AppError ? err.message : f.message;

  await prisma.source.update({
    where: { id: sourceId },
    // Cast until Prisma client regen picks up errorCode/errorReason columns.
    data: { status: 'ERROR', errorCode: code, errorReason: message } as any,
  }).catch((e) => logger.error({ e }, 'Failed to mark source ERROR'));

  await logError({
    workspaceId,
    sourceType,
    sourceId,
    endpoint,
    errorCode: code,
    message,
    hint: err instanceof AppError ? err.hint : f.hint,
    requestId: requestContext.getStore()?.requestId,
    metadata,
    stack: err instanceof Error ? err.stack : null,
  });
}

export const sourcesService = {
  async addPdfSource(workspaceId: string, file: Express.Multer.File) {
    const source = await prisma.source.create({
      data: {
        workspaceId,
        type: 'PDF',
        title: file.originalname,
        status: 'INDEXING',
      },
    });

    this.triggerPdfIngestion(source.id, workspaceId, file).catch(err => {
      logger.error({
        err,
        sourceId: source.id,
        workspaceId,
        filename: file.originalname,
        event: 'INGESTION_FAILED',
        sourceType: 'PDF',
      }, 'PDF ingestion failed');
    });

    return source;
  },

  async triggerPdfIngestion(sourceId: string, workspaceId: string, file: Express.Multer.File) {
    try {
      const formData = new FormData();
      formData.append('workspaceId', workspaceId);
      formData.append('sourceId', sourceId);

      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
      formData.append('file', blob, file.originalname);

      const response = await aiClient.post('/ingest/pdf', formData);

      const { chunksIndexed, pages } = response.data;

      await prisma.source.update({
        where: { id: sourceId },
        data: { status: 'READY' },
      });

      await prisma.pdfDocument.upsert({
        where: { sourceId },
        update: {
          filename: file.originalname,
          pageCount: pages ?? null,
          byteSize: file.size ?? null,
        },
        create: {
          sourceId,
          filename: file.originalname,
          pageCount: pages ?? null,
          byteSize: file.size ?? null,
        },
      });

      logger.info({ sourceId, chunksIndexed, pages }, 'PDF ingestion complete');
    } catch (error) {
      await markSourceErrored(sourceId, workspaceId, 'PDF', '/api/sources/pdf', error, {
        filename: file.originalname,
        size: file.size,
      });
      throw error;
    }
  },

  async addNotesSource(workspaceId: string, file: Express.Multer.File) {
    const source = await prisma.source.create({
      data: {
        workspaceId,
        type: 'NOTES',
        title: file.originalname,
        status: 'INDEXING',
      },
    });

    this.triggerNotesIngestion(source.id, workspaceId, file).catch(err => {
      logger.error({
        err,
        sourceId: source.id,
        workspaceId,
        filename: file.originalname,
        event: 'INGESTION_FAILED',
        sourceType: 'NOTES',
      }, 'Notes ingestion failed');
    });

    return source;
  },

  async triggerNotesIngestion(sourceId: string, workspaceId: string, file: Express.Multer.File) {
    try {
      const formData = new FormData();
      formData.append('workspaceId', workspaceId);
      formData.append('sourceId', sourceId);
      
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
      formData.append('file', blob, file.originalname);

      const response = await aiClient.post('/ingest/notes/upload', formData);

      const { chunksIndexed } = response.data;

      await prisma.source.update({
        where: { id: sourceId },
        data: { status: 'READY' },
      });

      await prisma.notesCollection.upsert({
        where: { sourceId },
        update: { collectionName: file.originalname },
        create: {
          sourceId,
          collectionName: file.originalname,
          provider: 'LOCAL',
        },
      });

      logger.info({ sourceId, chunksIndexed }, 'Notes ingestion complete');
    } catch (error) {
      await markSourceErrored(sourceId, workspaceId, 'NOTES', '/api/sources/notes', error, {
        filename: file.originalname,
      });
      throw error;
    }
  },

  async listSources(workspaceId: string) {
    return prisma.source.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        notesCollection: true,
        _count: {
          select: { documents: true },
        },
      },
    });
  },

  async deleteSource(id: string, workspaceId: string) {
    const source = await prisma.source.findUnique({
      where: { id },
    });

    if (!source || source.workspaceId !== workspaceId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, { message: 'Source not found', statusCode: 404 });
    }

    await prisma.source.delete({
      where: { id },
    });

    return { success: true };
  },

  async syncNotes(workspaceId: string) {
    const count = await prisma.source.count({
      where: { workspaceId, type: 'NOTES', status: 'READY' },
    });
    return { synced: count };
  },
};
