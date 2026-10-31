import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { config } from '../config/env.js';

const message = (msg: string) => ({ success: false, message: msg, code: 'TOO_MANY_REQUESTS' });

/** Strict limiter for credential endpoints to slow down brute-force attacks. */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.env === 'test' ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: message('Too many attempts. Please try again in 15 minutes.'),
});

/** Order creation limiter — protects against duplicate/hammered checkout requests. */
export const orderLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: config.env === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many order attempts. Please wait a few minutes.'),
});

/** Global API limiter. */
export const apiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  limit: config.env === 'test' ? 10000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('Too many requests, please slow down.'),
});

export default apiLimiter;
