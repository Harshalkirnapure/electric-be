import { config } from '../config/env.js';
import AppError from '../utils/AppError.js';
import { USER_ROLES } from '../models/User.js';
/** Restricts a route to the given roles. Must run after `authenticate`. */
export function authorize(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            return next(AppError.unauthorized());
        if (!roles.includes(req.user.role)) {
            return next(AppError.forbidden('Administrator access required', 'INSUFFICIENT_ROLE'));
        }
        next();
    };
}
/** Blocks customer self-registration from granting admin rights. */
export function preventRoleEscalation(body) {
    if (!body)
        return;
    if ('role' in body && body.role !== undefined && body.role !== 'customer') {
        throw AppError.forbidden('Role cannot be set during registration', 'ROLE_ESCALATION');
    }
}
export const adminOnly = authorize('admin');
export const customerOnly = authorize('customer', 'admin');
export { USER_ROLES, config };
export default authorize;
//# sourceMappingURL=authorize.js.map