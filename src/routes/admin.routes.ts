import { Router } from 'express';
import {
  listOrders,
  getOrderStats,
  getOrder,
  updateOrderStatus,
  updateShipping,
  addAdminNote,
  listPayments,
} from '../controllers/adminOrder.controller.js';
import {
  listInventory,
  getLowStockAlerts,
  createAdjustment,
  listAdjustments,
  getDashboard,
} from '../controllers/adminInventory.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import {
  orderListQuerySchema,
  updateOrderStatusSchema,
  updateShippingSchema,
} from '../validators/order.validator.js';
import {
  inventoryAdjustmentSchema,
  inventoryListQuerySchema,
  dashboardQuerySchema,
} from '../validators/inventory.validator.js';

const router = Router();

router.use(authenticate, authorize('admin'));

/** Dashboard */
router.get('/dashboard', validate({ query: dashboardQuerySchema }), getDashboard);

/** Orders */
router.get('/orders', validate({ query: orderListQuerySchema }), listOrders);
router.get('/orders/stats', getOrderStats);
router.get('/orders/:id', getOrder);
router.patch('/orders/:id/status', validate({ body: updateOrderStatusSchema }), updateOrderStatus);
router.patch('/orders/:id/shipping', validate({ body: updateShippingSchema }), updateShipping);
router.post('/orders/:id/notes', addAdminNote);

/** Payments */
router.get('/payments', listPayments);

/** Inventory */
router.get('/inventory', validate({ query: inventoryListQuerySchema }), listInventory);
router.get('/inventory/alerts', getLowStockAlerts);
router.get('/inventory/adjustments', listAdjustments);
router.post('/inventory/adjustments', validate({ body: inventoryAdjustmentSchema }), createAdjustment);

export default router;
