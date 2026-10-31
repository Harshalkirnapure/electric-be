import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { config } from '../config/env.js';

interface MongoServerError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
  errors?: Record<string, { message?: string }>;
}

/** Maps common Mongo/Mongoose errors onto HTTP-friendly errors. */
function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return new AppError(
      422,
      'Validation failed',
      'VALIDATION_ERROR',
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return new AppError(
      422,
      'Validation failed',
      'VALIDATION_ERROR',
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    );
  }

  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, `Invalid ${err.path}: ${err.value}`, 'INVALID_ID');
  }

  if (err instanceof mongoose.Error.DocumentNotFoundError) {
    return AppError.notFound('Resource not found');
  }

  if (err instanceof mongoose.Error.MongooseServerSelectionError) {
    return new AppError(503, 'Database is unavailable, please try again', 'DB_UNAVAILABLE');
  }

  const mongoErr = err as MongoServerError;
  if (mongoErr?.code === 11000) {
    const field = Object.keys(mongoErr.keyValue ?? {})[0] ?? 'field';
    return AppError.conflict(`Duplicate value for "${field}"`, 'DUPLICATE_KEY');
  }

  if (mongoErr?.name === 'JsonWebTokenError') {
    return AppError.unauthorized('Invalid or malformed token', 'INVALID_TOKEN');
  }
  if (mongoErr?.name === 'TokenExpiredError') {
    return AppError.unauthorized('Session expired, please sign in again', 'TOKEN_EXPIRED');
  }

  return AppError.internal();
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
}

/** Centralized error handler — no stack traces or internals leak in production. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appError = normalizeError(err);
  const requestId = req.id;

  const meta: Record<string, unknown> = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode: appError.statusCode,
    code: appError.code,
    userId: req.user?._id ? String(req.user._id) : undefined,
  };

  if (appError.statusCode >= 500) {
    logger.error(appError.message, { ...meta, error: err instanceof Error ? err : new Error(String(err)) });
  } else {
    logger.warn(appError.message, meta);
  }

  const body: Record<string, unknown> = {
    success: false,
    message: appError.message,
    code: appError.code,
    requestId,
  };

  if (appError.details) body.details = appError.details;

  if (config.env !== 'production' && appError.statusCode >= 500) {
    body.stack = err instanceof Error ? err.stack : undefined;
  }

  res.status(appError.statusCode).json(body);
}

export default errorHandler;
