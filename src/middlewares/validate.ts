import type { NextFunction, Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import AppError from '../utils/AppError.js';

type Source = 'body' | 'query' | 'params';

function validatePart(source: Source, schema: ZodTypeAny, data: unknown) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || source,
      message: i.message,
    }));
    throw AppError.unprocessable(
      `Invalid request ${source}`,
      'VALIDATION_ERROR',
      details,
    );
  }
  return result.data;
}

/** Validates and REPLACES req.body / req.query / req.params with parsed values. */
export function validate(schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = validatePart('body', schemas.body, req.body);
      if (schemas.query) {
        const parsed = validatePart('query', schemas.query, req.query);
        // Express 5 makes req.query a getter-only property.
        Object.defineProperty(req, 'query', { value: parsed, configurable: true, writable: true });
      }
      if (schemas.params) {
        req.params = validatePart('params', schemas.params, req.params) as typeof req.params;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Common reusable primitives. */
export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});

export default validate;
