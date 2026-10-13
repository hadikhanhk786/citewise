import { Router } from 'express';
import { chatController } from './chat.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { checkWorkspace } from '../../middleware/workspace';
import { createSessionSchema, sendMessageSchema, listSessionsSchema, getMessagesSchema } from './chat.schema';

const router = Router();

router.use(authenticate);
// We cannot blindly use checkWorkspace globally here because some chat routes 
// use session id instead of workspaceId. `checkWorkspace` expects `workspaceId`
// in body, query, or params. 
// listSessions and createSession have it.
router.post('/sessions', validate(createSessionSchema), checkWorkspace, chatController.createSession);
router.get('/sessions', validate(listSessionsSchema), checkWorkspace, chatController.listSessions);

// For these, we don't have workspaceId in the request directly, 
// the controller or service should ideally check if the session belongs to the user
router.get('/sessions/:id/messages', validate(getMessagesSchema), chatController.getMessages);
router.post('/sessions/:id/messages', validate(sendMessageSchema), chatController.sendMessage);

export const chatRoutes = router;
