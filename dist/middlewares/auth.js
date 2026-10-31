import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
export function signAccessToken(user) {
    const payload = { sub: String(user._id), role: user.role, type: 'access' };
    return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtl });
}
export function signRefreshToken(user) {
    const payload = { sub: String(user._id), role: user.role, type: 'refresh' };
    return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshTtl });
}
export function verifyToken(token, type = 'access') {
    const secret = type === 'access' ? config.jwt.accessSecret : config.jwt.refreshSecret;
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== type) {
        throw AppError.unauthorized('Invalid token type', 'INVALID_TOKEN');
    }
    return decoded;
}
function extractToken(req) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer '))
        return header.slice(7).trim();
    // Fallback to the HTTP-only cookie (used by browser clients).
    const cookieToken = req.cookies?.accessToken;
    return cookieToken ?? null;
}
/** Requires a valid, active user. Attaches `req.user`. */
export const authenticate = asyncHandler(async (req, _res, next) => {
    const token = extractToken(req);
    if (!token)
        throw AppError.unauthorized('Please sign in to continue', 'NO_TOKEN');
    const payload = verifyToken(token, 'access');
    const user = await User.findById(payload.sub);
    if (!user)
        throw AppError.unauthorized('Account no longer exists', 'USER_NOT_FOUND');
    if (!user.isActive)
        throw AppError.forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
    req.user = user;
    next();
});
/** Optional authentication — attaches `req.user` when a valid token is present. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
    const token = extractToken(req);
    if (!token)
        return next();
    try {
        const payload = verifyToken(token, 'access');
        const user = await User.findById(payload.sub);
        if (user?.isActive)
            req.user = user;
    }
    catch {
        // ignore invalid token for optional auth
    }
    next();
});
export default authenticate;
//# sourceMappingURL=auth.js.map