import { Request, Response, NextFunction } from 'express';
import { chatService } from './chat.service';

export const chatController = {
  createSession: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { workspaceId, mode, title } = req.body;
      const session = await chatService.createSession(workspaceId, req.user!.id, mode, title);
      res.status(201).json(session);
    } catch (error) {
      next(error);
    }
  },

  listSessions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query.workspaceId as string;
      const sessions = await chatService.listSessions(workspaceId, req.user!.id);
      res.json(sessions);
    } catch (error) {
      next(error);
    }
  },

  getMessages: async (req: Request, res: Response, next: NextFunction) => {
      try {
          const { id } = req.params;
          const messages = await chatService.getSessionMessages(id as string, req.user!.id);
          res.json(messages);
      } catch (error) {
          next(error);
      }
  },

  sendMessage: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params; // Session ID
      const { content, mode, strictSources, sourceIds } = req.body;
      const result = await chatService.sendMessage(
        id as string,
        req.user!.id,
        content,
        mode,
        strictSources,
        sourceIds,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
