import { Request, Response, NextFunction } from 'express';
import { ZodObject, ZodSchema } from 'zod';

export const validate = (schema: ZodObject<any> | ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    next(error);
  }
};
