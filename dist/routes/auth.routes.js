import { Router } from 'express';
import { register, login, logout, me, forgotPassword, resetPassword, refresh, } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.js';
import { authenticate } from '../middlewares/auth.js';
import { authLimiter } from '../middlewares/rateLimit.js';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, } from '../validators/auth.validator.js';
const router = Router();
router.post('/register', authLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', authenticate, me);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), resetPassword);
export default router;
//# sourceMappingURL=auth.routes.js.map