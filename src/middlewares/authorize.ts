import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';
import AppError from '../utils/AppError.js';
import { USER_ROLES, type UserRole, type UserDocument } from '../models/User.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserDocument;
  }
}

/** Restricts a route to the given roles. Must run after `authenticate`. */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('Administrator access required', 'INSUFFICIENT_ROLE'));
    }
    next();
  };
}

/** Blocks customer self-registration from granting admin rights. */
export function preventRoleEscalation(body: Record<string, unknown> | undefined): void {
  if (!body) return;
  if ('role' in body && body.role !== undefined && body.role !== 'customer') {
    throw AppError.forbidden('Role cannot be set during registration', 'ROLE_ESCALATION');
  }
}

export const adminOnly = authorize('admin');
export const customerOnly = authorize('customer', 'admin');
export { USER_ROLES, config };
export default authorize;
