import { Request, Response, NextFunction } from 'express';
import { analyticsService } from './analytics.service';

export const analyticsController = {
  getDashboard: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query.workspaceId as string;
      const data = await analyticsService.getDashboard(workspaceId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  },

  getInsights: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query.workspaceId as string;
      const data = await analyticsService.getInsights(workspaceId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
};
