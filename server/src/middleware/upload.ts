import multer from 'multer';
import { AppError } from './error-handler';
import path from 'path';

// Define allowed mime types and extensions
const ALLOWED_MIME_TYPES = [
  'text/plain', 
  'text/markdown', 
  'application/pdf'
];

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf'];

// Set up storage (in memory for proxying to Python service)
const storage = multer.memoryStorage();

// Set upload limits
const limits = {
  fileSize: 5 * 1024 * 1024, // 5 MB limit
};

// File filter for type validation
const makeFilter = (mimes: string[], exts: string[]) =>
  (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!mimes.includes(file.mimetype) || !exts.includes(ext)) {
      return cb(new AppError(`Invalid file type. Only ${exts.join(', ')} are allowed.`, 400));
    }
    cb(null, true);
  };

export const upload = multer({
  storage,
  limits,
  fileFilter: makeFilter(ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS),
});

// Training library (ADMIN only) also accepts HTML pages
export const libraryUpload = multer({
  storage,
  limits,
  fileFilter: makeFilter([...ALLOWED_MIME_TYPES, 'text/html'], [...ALLOWED_EXTENSIONS, '.html', '.htm']),
});
