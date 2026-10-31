/** Domain error type used across the application for expected, client-facing failures. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, message: string, code = 'APP_ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown) {
    return new AppError(400, message, code, details);
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, message, code);
  }
  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    return new AppError(403, message, code);
  }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, message, code);
  }
  static conflict(message: string, code = 'CONFLICT', details?: unknown) {
    return new AppError(409, message, code, details);
  }
  static unprocessable(message: string, code = 'UNPROCESSABLE', details?: unknown) {
    return new AppError(422, message, code, details);
  }
  static tooMany(message = 'Too many requests', code = 'TOO_MANY_REQUESTS') {
    return new AppError(429, message, code);
  }
  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return new AppError(500, message, code);
  }
}

export default AppError;
