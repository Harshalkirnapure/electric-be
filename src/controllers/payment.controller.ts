import type { Request, Response } from 'express';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import WebhookEvent from '../models/WebhookEvent.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import {
  createRazorpayOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  fetchPayment,
  fetchRazorpayOrder,
  isRazorpayConfigured,
} from '../services/payment.service.js';
import { restoreStock } from '../services/inventory.service.js';
import logger from '../utils/logger.js';

/** POST /api/v1/payments/create-order — creates the gateway order for a pending order. */
export const createPaymentOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.body as { orderId: string };

  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');

  const isOwner = String(order.user) === String(req.user!._id);
  if (!isOwner && req.user!.role !== 'admin') {
    throw AppError.forbidden('You cannot pay for this order', 'ORDER_ACCESS_DENIED');
  }
  if (order.payment.status === 'paid') {
    return sendSuccess(res, { order, alreadyPaid: true }, 'This order is already paid');
  }
  if (order.status !== 'pending_payment') {
    throw AppError.badRequest(`This order is in "${order.status}" status and cannot be paid`, 'ORDER_NOT_PAYABLE');
  }
  if (!isRazorpayConfigured()) {
    throw AppError.badRequest(
      'Online payments are not configured yet. Please choose cash on delivery.',
      'PAYMENT_NOT_CONFIGURED',
    );
  }

  const razorpayOrder = await createRazorpayOrder({
    amountInRupees: order.total,
    receipt: order.orderNumber,
    notes: {
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      customerEmail: order.customerEmail,
    },
  });

  order.payment.razorpayOrderId = razorpayOrder.id;
  await order.save();

  await Payment.create({
    order: order._id,
    user: order.user,
    orderNumber: order.orderNumber,
    method: 'razorpay',
    status: 'pending',
    amount: order.total,
    currency: 'INR',
    gateway: 'razorpay',
    razorpayOrderId: razorpayOrder.id,
    attempts: 1,
  });

  return sendSuccess(
    res,
    {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      keyId: process.env.RAZORPAY_KEY_ID,
    },
    'Payment order created',
  );
});

/** POST /api/v1/payments/verify — verifies the checkout signature and marks the order paid. */
export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body as {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  };

  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');

  const isOwner = String(order.user) === String(req.user!._id);
  if (!isOwner && req.user!.role !== 'admin') {
    throw AppError.forbidden('You cannot verify this payment', 'ORDER_ACCESS_DENIED');
  }

  if (order.payment.status === 'paid') {
    return sendSuccess(res, { order, alreadyPaid: true }, 'This order is already paid');
  }

  const signatureValid = verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
  if (!signatureValid) {
    await Payment.updateOne(
      { razorpayOrderId },
      { $set: { status: 'failed', failureReason: 'Signature verification failed' } },
    );
    throw AppError.badRequest('Payment verification failed', 'INVALID_PAYMENT_SIGNATURE');
  }

  // Confirm with the gateway that the money actually moved.
  const gatewayPayment = await fetchPayment(razorpayPaymentId);
  if (gatewayPayment.status !== 'captured' && !gatewayPayment.captured) {
    throw AppError.badRequest(
      `Payment is not complete (status: ${gatewayPayment.status})`,
      'PAYMENT_NOT_CAPTURED',
    );
  }

  if (Math.abs(gatewayPayment.amount - order.total) > 0.01) {
    logger.error('Payment amount mismatch', {
      orderNumber: order.orderNumber,
      expected: order.total,
      received: gatewayPayment.amount,
    });
    throw AppError.badRequest('Payment amount does not match the order total', 'AMOUNT_MISMATCH');
  }

  order.payment.status = 'paid';
  order.payment.razorpayPaymentId = razorpayPaymentId;
  order.payment.razorpaySignature = razorpaySignature;
  order.payment.paidAt = new Date();
  order.status = 'confirmed';
  order.timeline.push({ status: 'confirmed', note: 'Payment received', by: req.user?._id });
  await order.save();

  await Payment.updateOne(
    { razorpayOrderId },
    {
      $set: {
        status: 'paid',
        razorpayPaymentId,
        razorpaySignature,
        paidAt: new Date(),
        failureReason: undefined,
      },
    },
  );

  logger.info('Payment verified', { orderNumber: order.orderNumber, razorpayPaymentId });

  return sendSuccess(res, { order, payment: gatewayPayment }, 'Payment successful');
});

/**
 * POST /api/v1/payments/webhook
 * Raw body is required for signature verification — see the route registration.
 */
export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!signature || !rawBody) {
    throw AppError.badRequest('Missing webhook signature', 'MISSING_SIGNATURE');
  }

  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Webhook signature verification failed');
    throw AppError.badRequest('Invalid webhook signature', 'INVALID_SIGNATURE');
  }

  const event = JSON.parse(rawBody.toString('utf8')) as {
    event?: string;
    payload?: Record<string, any>;
  };

  const eventId =
    (event.payload?.payment?.entity as Record<string, unknown> | undefined)?.id
      ? `rzp_${(event.payload?.payment?.entity as Record<string, unknown>).id}`
      : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Idempotency: a unique index on eventId guarantees exactly-once processing.
  const existing = await WebhookEvent.findOne({ eventId });
  if (existing) {
    return sendSuccess(res, { received: true, duplicate: true }, 'Event already processed');
  }

  await WebhookEvent.create({
    eventId,
    provider: 'razorpay',
    eventType: event.event ?? 'unknown',
    payload: event.payload,
    status: 'received',
  });

  try {
    await processWebhookEvent(event.event ?? '', event.payload ?? {});
    await WebhookEvent.updateOne({ eventId }, { $set: { status: 'processed', processedAt: new Date() } });
  } catch (err) {
    logger.error('Webhook processing failed', { eventId, error: err });
    await WebhookEvent.updateOne(
      { eventId },
      { $set: { status: 'failed', error: err instanceof Error ? err.message : String(err) } },
    );
  }

  return sendSuccess(res, { received: true }, 'Webhook processed');
});

/** Applies a gateway event to the local order/payment records. */
export async function processWebhookEvent(
  eventType: string,
  payload: Record<string, any>,
): Promise<void> {
  const paymentEntity = payload.payment?.entity as Record<string, unknown> | undefined;
  if (!paymentEntity) return;

  const razorpayOrderId = String(paymentEntity.order_id ?? '');
  const razorpayPaymentId = String(paymentEntity.id ?? '');

  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
    if (!order || order.payment.status === 'paid') return;

    order.payment.status = 'paid';
    order.payment.razorpayPaymentId = razorpayPaymentId;
    order.payment.paidAt = new Date();
    if (order.status === 'pending_payment') {
      order.status = 'confirmed';
      order.timeline.push({ status: 'confirmed', note: 'Payment captured (webhook)' });
    }
    await order.save();

    await Payment.updateOne(
      { razorpayOrderId },
      { $set: { status: 'paid', razorpayPaymentId, paidAt: new Date() } },
    );
    return;
  }

  if (eventType === 'payment.failed') {
    const order = await Order.findOne({ 'payment.razorpayOrderId': razorpayOrderId });
    await Payment.updateOne(
      { razorpayOrderId },
      { $set: { status: 'failed', failureReason: String(paymentEntity.error_description ?? 'Payment failed') } },
    );
    if (order && order.status === 'pending_payment') {
      order.payment.status = 'failed';
      order.payment.failureReason = String(paymentEntity.error_description ?? 'Payment failed');
      order.timeline.push({ status: 'pending_payment', note: 'Payment failed — awaiting retry' });
      await order.save();
    }
    return;
  }

  if (eventType === 'refund.processed' || eventType === 'refund.settled') {
    const refundEntity = payload.refund?.entity as Record<string, unknown> | undefined;
    if (!refundEntity) return;

    const payment = await Payment.findOne({ razorpayPaymentId: refundEntity.payment_id });
    if (!payment) return;

    const refundAmount = Number(refundEntity.amount ?? 0) / 100;
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'refunded',
          'refund.refundId': String(refundEntity.id ?? ''),
          'refund.amount': refundAmount,
          'refund.status': 'processed',
        },
      },
    );

    const order = await Order.findById(payment.order);
    if (order) {
      const refunded = (order.payment.refundedAmount ?? 0) + refundAmount;
      order.payment.refundedAmount = refunded;
      order.payment.refundId = String(refundEntity.id ?? '');
      order.payment.refundedAt = new Date();
      order.payment.status = refunded >= order.total ? 'refunded' : 'partially_refunded';
      order.status = 'refunded';
      order.timeline.push({ status: 'refunded', note: `Refund of ₹${refundAmount} processed` });
      await order.save();

      if (!order.stockRestored) {
        await restoreStock(
          order.items.map((i) => ({ productId: String(i.product), quantity: i.quantity })),
          { reason: `Order ${order.orderNumber} refunded`, referenceType: 'order', referenceId: String(order._id) },
        );
        order.stockRestored = true;
        await order.save();
      }
    }
  }
}

export default { createPaymentOrder, verifyPayment, handleWebhook };

