import { Router } from 'express';
import { sourcesController } from './sources.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { rbac } from '../../middleware/rbac';
import { checkWorkspace } from '../../middleware/workspace';
import { upload } from '../../middleware/upload';
import {
  listSourcesSchema,
  deleteSourceSchema,
  uploadNotesSchema,
  uploadPdfSchema,
  syncNotesSchema,
} from './sources.schema';

const router = Router();

router.use(authenticate);

// checkWorkspace is applied per-route so it runs after multer on file uploads
// (multer must parse the body before workspace membership can be checked)
router.post('/notes/upload', upload.single('file'), checkWorkspace, validate(uploadNotesSchema), rbac(['ADMIN', 'MEMBER']), sourcesController.uploadNotes);
router.post('/pdf', upload.single('file'), checkWorkspace, validate(uploadPdfSchema), rbac(['ADMIN', 'MEMBER']), sourcesController.uploadPdf);
router.post('/sync-notes', checkWorkspace, validate(syncNotesSchema), sourcesController.syncNotes);
router.get('/', checkWorkspace, validate(listSourcesSchema), sourcesController.list);
router.delete('/:id', checkWorkspace, validate(deleteSourceSchema), rbac(['ADMIN', 'MEMBER']), sourcesController.delete);

export const sourcesRoutes = router;
