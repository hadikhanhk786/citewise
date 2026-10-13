import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from './error-handler';

export const checkWorkspace = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }

    // `workspaceId` might be in headers, body, query, or params depending on the route
    const workspaceId = req.headers['x-workspace-id'] || req.body?.workspaceId || req.query.workspaceId || req.params.workspaceId;

    if (!workspaceId) {
      // If a route requires workspaceId but none is provided, validation should ideally catch it first.
      // But if it slips through and relies on this middleware, we must reject it.
      return next(new AppError('workspaceId is required', 400));
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          userId: req.user.id,
          workspaceId: workspaceId as string,
        },
      },
    });

    if (!membership) {
      return next(new AppError('Forbidden: Not a member of this workspace', 403));
    }

    // Optionally attach membership role to request for fine-grained authorization later
    req.workspaceRole = membership.role;

    next();
  } catch (error) {
    next(error);
  }
};
