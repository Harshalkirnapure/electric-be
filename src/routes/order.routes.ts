import { Router } from 'express';
import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  refundOrder,
} from '../controllers/order.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { orderLimiter } from '../middlewares/rateLimit.js';
import {
  createOrderSchema,
  cancelOrderSchema,
  refundSchema,
  orderListQuerySchema,
} from '../validators/order.validator.js';

const router = Router();

router.use(authenticate);

router.post('/', orderLimiter, validate({ body: createOrderSchema }), createOrder);
router.get('/my-orders', validate({ query: orderListQuerySchema }), getMyOrders);
router.get('/:id', getOrderById);
router.post('/:id/cancel', validate({ body: cancelOrderSchema }), cancelOrder);
router.post('/:id/refund', authorize('admin'), validate({ body: refundSchema }), refundOrder);

export default router;
