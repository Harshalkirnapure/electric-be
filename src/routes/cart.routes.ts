import { Router } from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  replaceCart,
  removeCartItem,
  clearCart,
} from '../controllers/cart.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { cartItemSchema, updateCartSchema } from '../validators/order.validator.js';

const router = Router();

router.use(authenticate);

router.get('/', getCart);
// POST adds a single line and accumulates the quantity for that product.
router.post('/items', validate({ body: cartItemSchema }), addToCart);
// PUT replaces the entire cart with the supplied list (absolute quantities).
router.put('/items', validate({ body: updateCartSchema }), replaceCart);
router.patch('/items/:product', validate({ body: cartItemSchema.partial() }), updateCartItem);
router.delete('/items/:product', removeCartItem);
router.delete('/', clearCart);

export default router;
