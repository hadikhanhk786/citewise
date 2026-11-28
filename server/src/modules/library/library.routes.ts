import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { rbac } from '../../middleware/rbac';
import { libraryUpload } from '../../middleware/upload';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES } from '../../lib/error-codes';
import { aiClient } from '../../clients/aiClient';

// Owner-added training material: proxied to the RAG service's /library endpoints.
const router = Router();
router.use(authenticate, rbac(['ADMIN']));

router.post('/', libraryUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const url = typeof req.body.url === 'string' ? req.body.url.trim() : '';
    const file = req.file;
    if (!!file === !!url) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, { message: 'Send either a file or a link.' });
    }
    const form = new FormData();
    form.append('title', String(req.body.title ?? ''));
    form.append('addedBy', req.user?.email ?? '');
    if (file) form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
    else form.append('url', url);
    const { data } = await aiClient.post('/library/add', form);
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await aiClient.get('/library/items');
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/:sourceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await aiClient.delete(`/library/items/${encodeURIComponent(String(req.params.sourceId))}`);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export const libraryRoutes = router;
