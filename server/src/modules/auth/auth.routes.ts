import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { rbac } from '../../middleware/rbac';
import { registerSchema, loginSchema, createInviteSchema } from './auth.schema';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/invites', authenticate, rbac(['ADMIN']), validate(createInviteSchema), authController.createInvite);
router.get('/me', authenticate, authController.getMe);

export const authRoutes = router;
