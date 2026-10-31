import { z } from 'zod';
import { addressSchema, objectIdSchema, phoneSchema } from './common.js';
import { PAYMENT_METHODS, ORDER_STATUSES, SHIPMENT_STATUSES } from '../models/Order.js';

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        product: objectIdSchema,
        quantity: z.coerce.number().int().min(1).max(999),
      }),
    )
    .min(1, 'Your cart is empty'),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().trim().email().max(160),
  customerPhone: phoneSchema,
  paymentMethod: z.enum(PAYMENT_METHODS).default('razorpay'),
  notes: z.string().trim().max(500).optional(),
  // Client-generated key used to make order creation idempotent.
  idempotencyKey: z.string().trim().max(100).optional(),
});

export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(['pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded']).optional(),
  search: z.string().trim().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest', 'amount_desc', 'amount_asc']).default('newest'),
});

export const orderIdParamsSchema = z.object({ id: objectIdSchema });

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const updateShippingSchema = z.object({
  courierName: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
  provider: z.string().trim().max(60).optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  notes: z.string().trim().max(500).optional(),
  etaDays: z.coerce.number().int().min(0).max(60).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  restoreStock: z.boolean().default(true),
});

export const refundSchema = z.object({
  amount: z.coerce.number().min(0).optional(),
  reason: z.string().trim().min(3).max(500),
});

export const deliveryCheckSchema = z.object({
  pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const createPaymentOrderSchema = z.object({
  orderId: objectIdSchema,
});

export const verifyPaymentSchema = z.object({
  orderId: objectIdSchema,
  razorpayOrderId: z.string().min(4).max(100),
  razorpayPaymentId: z.string().min(4).max(100),
  razorpaySignature: z.string().min(16).max(256),
});

export const cartItemSchema = z.object({
  product: objectIdSchema,
  quantity: z.coerce.number().int().min(1).max(999),
});

export const updateCartSchema = z.object({
  items: z.array(cartItemSchema).min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
