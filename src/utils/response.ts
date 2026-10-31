import type { Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  requestId?: string;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
  meta?: ApiResponse<T>['meta'],
): Response {
  const requestId = res.locals?.requestId as string | undefined;

  const body: ApiResponse<T> = {
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
    ...(requestId ? { requestId } : {}),
  };
  return res.status(statusCode).json(body);
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number,
  message = 'Success',
): Response {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return sendSuccess(res, items, message, 200, { page, limit, total, totalPages });
}

export default sendSuccess;
