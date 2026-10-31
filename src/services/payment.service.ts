import Razorpay from 'razorpay';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';
import AppError from '../utils/AppError.js';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(config.razorpay.keyId && config.razorpay.keySecret);
}

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw AppError.badRequest(
      'Payment gateway is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      'PAYMENT_NOT_CONFIGURED',
    );
  }
  if (!client) {
    client = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return client;
}

/** Creates a Razorpay order using a server-calculated amount (in paise). */
export async function createRazorpayOrder(params: {
  amountInRupees: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const razorpay = getRazorpayClient();
  const amountInPaise = Math.round(params.amountInRupees * 100);

  const order = await razorpay.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: params.receipt,
    notes: params.notes ?? {},
  });

  logger.info('Razorpay order created', {
    razorpayOrderId: order.id,
    amount: amountInPaise,
    receipt: params.receipt,
  });

  return order as unknown as RazorpayOrder;
}

/** Verifies the checkout signature returned by the browser. */
export function verifyCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret || '')
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(params.razorpaySignature, 'utf8');

  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/** Verifies a webhook signature against the RAW request body. */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/** Fetches authoritative payment status from Razorpay. */
export async function fetchPayment(razorpayPaymentId: string): Promise<{
  id: string;
  status: string;
  amount: number;
  method?: string;
  captured?: boolean;
}> {
  const razorpay = getRazorpayClient();
  const payment = (await razorpay.payments.fetch(razorpayPaymentId)) as unknown as Record<string, unknown>;
  return {
    id: String(payment.id),
    status: String(payment.status ?? ''),
    amount: Number(payment.amount ?? 0) / 100,
    method: payment.method ? String(payment.method) : undefined,
    captured: Boolean(payment.captured),
  };
}

/** Fetches authoritative order status from Razorpay. */
export async function fetchRazorpayOrder(razorpayOrderId: string): Promise<{
  id: string;
  status: string;
  amount: number;
  paid: boolean;
}> {
  const razorpay = getRazorpayClient();
  const order = (await razorpay.orders.fetch(razorpayOrderId)) as unknown as Record<string, unknown>;
  return {
    id: String(order.id),
    status: String(order.status ?? ''),
    amount: Number(order.amount ?? 0) / 100,
    paid: Boolean(order.paid),
  };
}

/** Creates a refund through the gateway (full or partial). */
export async function createRazorpayRefund(params: {
  razorpayPaymentId: string;
  amountInRupees?: number;
  reason?: string;
}): Promise<{ id: string; status: string; amount: number }> {
  const razorpay = getRazorpayClient();
  const refund = (await razorpay.payments.refund(params.razorpayPaymentId, {
    ...(params.amountInRupees ? { amount: Math.round(params.amountInRupees * 100) } : {}),
    ...(params.reason ? { speed: 'normal', notes: { reason: params.reason } } : {}),
  })) as unknown as Record<string, unknown>;

  return {
    id: String(refund.id),
    status: String(refund.status ?? 'pending'),
    amount: Number(refund.amount ?? 0) / 100,
  };
}

export default getRazorpayClient;
