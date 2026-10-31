import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    log: {
      error: (m: string, meta?: Record<string, unknown>) => void;
      warn: (m: string, meta?: Record<string, unknown>) => void;
      info: (m: string, meta?: Record<string, unknown>) => void;
      debug: (m: string, meta?: Record<string, unknown>) => void;
    };
  }
}

/** Attaches a unique request id and a request-scoped logger. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  req.id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  // Expose the id to the response helpers so it can be echoed in the body.
  res.locals.requestId = req.id;
  req.log = logger.child({ requestId: req.id });
  next();
}

export default requestId;
