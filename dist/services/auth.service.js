import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { signAccessToken, signRefreshToken } from '../middlewares/auth.js';
export const ACCESS_COOKIE = 'accessToken';
export const REFRESH_COOKIE = 'refreshToken';
function baseCookieOptions() {
    return {
        httpOnly: true,
        secure: config.cookie.secure,
        sameSite: config.env === 'production' ? 'none' : 'lax',
        domain: config.cookie.domain,
        path: '/',
    };
}
export function setAuthCookies(res, user) {
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.cookie(ACCESS_COOKIE, accessToken, {
        ...baseCookieOptions(),
        maxAge: 15 * 60 * 1000,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
        ...baseCookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}
export function clearAuthCookies(res) {
    res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions() });
    res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions() });
}
/**
 * Double-submit CSRF token. The value is readable by JavaScript and must be
 * echoed back in the `X-CSRF-Token` header on state-changing requests.
 */
export function issueCsrfToken(res) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrfToken', token, {
        ...baseCookieOptions(),
        httpOnly: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return token;
}
export default setAuthCookies;
//# sourceMappingURL=auth.service.js.map