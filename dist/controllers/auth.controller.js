import crypto from 'node:crypto';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { setAuthCookies, clearAuthCookies, issueCsrfToken } from '../services/auth.service.js';
import { verifyToken } from '../middlewares/auth.js';
import logger from '../utils/logger.js';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
/** POST /api/v1/auth/register */
export const register = asyncHandler(async (req, res) => {
    const { name, email, phone, password, addresses } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
        throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    const user = new User({ name, email, phone, role: 'customer', addresses: addresses ?? [] });
    await user.hashPassword(password);
    await user.save();
    setAuthCookies(res, user);
    issueCsrfToken(res);
    logger.info('New customer registered', { userId: String(user._id), email });
    return sendSuccess(res, { user: user.toPublicJSON() }, 'Account created successfully', 201);
});
/** POST /api/v1/auth/login */
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.verifyPassword(password))) {
        throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (!user.isActive) {
        throw AppError.forbidden('This account has been disabled. Please contact the store.', 'ACCOUNT_DISABLED');
    }
    user.lastLoginAt = new Date();
    await user.save();
    setAuthCookies(res, user);
    issueCsrfToken(res);
    return sendSuccess(res, { user: user.toPublicJSON() }, 'Signed in successfully');
});
/** POST /api/v1/auth/logout */
export const logout = asyncHandler(async (_req, res) => {
    clearAuthCookies(res);
    return sendSuccess(res, null, 'Signed out successfully');
});
/** GET /api/v1/auth/me */
export const me = asyncHandler(async (req, res) => {
    if (!req.user)
        throw AppError.unauthorized();
    return sendSuccess(res, { user: req.user.toPublicJSON() });
});
/**
 * POST /api/v1/auth/forgot-password
 * Always responds identically so the endpoint cannot be used to enumerate accounts.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    const genericMessage = 'If an account exists for that email, a password reset link has been sent.';
    if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        user.refreshTokenHash = tokenHash;
        user.passwordChangedAt = new Date();
        await user.save();
        logger.info('Password reset requested', { userId: String(user._id) });
        // In production this token is emailed. In development it is returned so the
        // flow can be tested without a mail server. Never enabled in production.
        if (process.env.NODE_ENV !== 'production') {
            return sendSuccess(res, { resetToken: token, emailHint: email }, genericMessage);
        }
    }
    return sendSuccess(res, null, genericMessage);
});
/** POST /api/v1/auth/reset-password */
export const resetPassword = asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ refreshTokenHash: tokenHash });
    if (!user)
        throw AppError.badRequest('This reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
    const changedAt = user.passwordChangedAt?.getTime() ?? 0;
    if (Date.now() - changedAt > RESET_TOKEN_TTL_MS) {
        throw AppError.badRequest('This reset link is invalid or has expired', 'EXPIRED_RESET_TOKEN');
    }
    await user.hashPassword(password);
    user.refreshTokenHash = undefined;
    user.passwordChangedAt = new Date();
    await user.save();
    clearAuthCookies(res);
    return sendSuccess(res, null, 'Password updated. Please sign in again.');
});
/** POST /api/v1/auth/refresh — rotates the access token using the refresh cookie. */
export const refresh = asyncHandler(async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (!token)
        throw AppError.unauthorized('No refresh token provided', 'NO_REFRESH_TOKEN');
    const payload = verifyToken(token, 'refresh');
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive)
        throw AppError.unauthorized('Session is no longer valid');
    setAuthCookies(res, user);
    return sendSuccess(res, { user: user.toPublicJSON() }, 'Session refreshed');
});
export default { register, login, logout, me, forgotPassword, resetPassword, refresh };
//# sourceMappingURL=auth.controller.js.map