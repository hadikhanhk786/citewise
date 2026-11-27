import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { createInvite } from '../../lib/invite';

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

  createInvite: (req: Request, res: Response) => {
    const email = String(req.body.email).trim().toLowerCase();
    const appUrl = process.env.APP_URL || 'https://hadikhanhk786.github.io/citewise';
    const token = createInvite(email, req.body.days);
    res.status(201).json({ link: `${appUrl}/register?email=${encodeURIComponent(email)}&invite=${token}` });
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
