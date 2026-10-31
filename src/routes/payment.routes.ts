import { Router } from 'express';
import {
  createPaymentOrder,
  verifyPayment,
  handleWebhook,
} from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createPaymentOrderSchema,
  verifyPaymentSchema,
} from '../validators/order.validator.js';
import { config } from '../config/env.js';

const router = Router();

/** The webhook must be registered before the JSON body parser so the raw body
 *  is available for signature verification. */
router.post('/webhook', handleWebhook);

router.post('/create-order', authenticate, validate({ body: createPaymentOrderSchema }), createPaymentOrder);
router.post('/verify', authenticate, validate({ body: verifyPaymentSchema }), verifyPayment);

router.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      gateway: 'razorpay',
      enabled: Boolean(config.razorpay.keyId && config.razorpay.keySecret),
      keyId: config.razorpay.keyId ?? null,
      codEnabled: config.cod.enabled,
    },
  });
});

export default router;
