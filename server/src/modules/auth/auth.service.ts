import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { AppError } from '../../middleware/error-handler';
import { inviteMatches } from '../../lib/invite';
import { registerSchema, loginSchema } from './auth.schema';
import { z } from 'zod';

type RegisterInput = z.infer<typeof registerSchema>['body'];
type LoginInput = z.infer<typeof loginSchema>['body'];

export const authService = {
  async register(input: RegisterInput) {
    // Sign-up is invite-only; existing accounts are unaffected (login doesn't change).
    if (!inviteMatches(input.invite, input.email)) {
      throw new AppError('Citewise is invite-only. Ask the owner for an invite link.', 403);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new AppError('User already exists', 400);
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    // Transaction: Create user + default workspace
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash: hashedPassword,
          name: input.name,
          role: 'ADMIN', // First user is admin for simplicity in this MVP
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: `${user.name}'s Workspace`,
        },
      });

      const workspaceMembership = await tx.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          role: 'OWNER',
        },
      });

      return { 
        user: {
          ...user,
          workspaceMemberships: [
            {
              ...workspaceMembership,
              workspace
            }
          ]
        }, 
        workspace 
      };
    });

    const token = jwt.sign(
      { userId: result.user.id, role: result.user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    return { user: result.user, token, workspace: result.workspace };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        workspaceMemberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isValid) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );

    return { user, token };
  },

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        workspaceMemberships: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  },
};
