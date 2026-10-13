import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';

export const authController = {
  register: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },

  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  getMe: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // req.user is set by auth middleware
      const user = await authService.getMe(req.user!.id);
      res.json(user);
    } catch (error) {
      next(error);
    }
  },
};
