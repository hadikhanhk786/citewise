import { Request, Response, NextFunction } from 'express';
import { sourcesService } from './sources.service';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES } from '../../lib/error-codes';

export const sourcesController = {
  uploadPdf: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.body.workspaceId || req.query.workspaceId;
      const file = req.file;

      if (!file) {
        throw new AppError(ERROR_CODES.BAD_REQUEST, { message: 'No file uploaded', statusCode: 400 });
      }
      if (!file.originalname.toLowerCase().endsWith('.pdf')) {
        throw new AppError(ERROR_CODES.PDF_UNSUPPORTED_TYPE);
      }
      if (file.size === 0) {
        throw new AppError(ERROR_CODES.PDF_EMPTY_FILE);
      }

      const source = await sourcesService.addPdfSource(workspaceId as string, file);
      res.status(201).json(source);
    } catch (error) {
      next(error);
    }
  },

  uploadNotes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.body.workspaceId || req.query.workspaceId;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'No file uploaded' } });
      }

      const source = await sourcesService.addNotesSource(workspaceId as string, file);
      res.status(201).json(source);
    } catch (error) {
      next(error);
    }
  },

  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query.workspaceId as string;
      const sources = await sourcesService.listSources(workspaceId);
      res.json(sources);
    } catch (error) {
      next(error);
    }
  },

  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Zod validates these are string UUIDs; params/query type unions require cast
      const id = req.params['id'] as string;
      const workspaceId = req.query['workspaceId'] as string;
      await sourcesService.deleteSource(id, workspaceId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  syncNotes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query['workspaceId'] as string;
      const result = await sourcesService.syncNotes(workspaceId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
