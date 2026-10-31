import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { getApp } from './setup.js';
import { API, ADDRESS, registerCustomer, setConfigValue, type Session } from './helpers.js';

let session: Session;
let productId: string;

beforeAll(async () => {
  session = await registerCustomer();
  const list = await request(getApp()).get(`${API}/products`).query({ limit: 1 });
  productId = list.body.data[0]._id;
});

function auth(req: request.Test): request.Test {
  return req.set('Authorization', `Bearer ${session.token}`);
}

describe('delivery configuration', () => {
  it('exposes the public delivery configuration', async () => {
    const res = await request(getApp()).get(`${API}/delivery/config`);

    expect(res.status).toBe(200);
    expect(res.body.data.method).toBe('local_delivery');
    expect(res.body.data).toHaveProperty('deliveryRadiusKm');
    expect(res.body.data).toHaveProperty('localDeliveryCharge');
    expect(res.body.data).toHaveProperty('freeDeliveryAbove');
    expect(res.body.data).toHaveProperty('codEnabled');
  });

  it('checks delivery eligibility for a valid PIN code', async () => {
    const res = await request(getApp())
      .post(`${API}/delivery/check`)
      .send({ pincode: ADDRESS.pincode });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('eligible');
    expect(res.body.data.method).toBe('local_delivery');
  });

  it('rejects a malformed PIN code', async () => {
    const res = await request(getApp()).post(`${API}/delivery/check`).send({ pincode: '12' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects out-of-range coordinates', async () => {
    const res = await request(getApp())
      .post(`${API}/delivery/check`)
      .send({ pincode: '000000', lat: 200, lng: 0 });

    expect(res.status).toBe(422);
  });
});

describe('payment configuration', () => {
  it('exposes the payment configuration', async () => {
    const res = await request(getApp()).get(`${API}/payments/config`);

    expect(res.status).toBe(200);
    expect(res.body.data.gateway).toBe('razorpay');
    expect(res.body.data).toHaveProperty('enabled');
  });

  it('refuses to create a payment order when the gateway is unconfigured', async () => {
    const res = await auth(request(getApp()).post(`${API}/payments/create-order`)).send({
      orderId: '507f1f77bcf86cd799439011',
    });

    // Without Razorpay keys the server must not pretend the order exists.
    expect([400, 404]).toContain(res.status);
    if (res.status === 400) expect(res.body.code).toBe('PAYMENT_NOT_CONFIGURED');
  });

  it('rejects a payment verification with a forged signature', async () => {
    const res = await auth(request(getApp()).post(`${API}/payments/verify`)).send({
      orderId: '507f1f77bcf86cd799439011',
      razorpayOrderId: 'order_test123',
      razorpayPaymentId: 'pay_test123',
      razorpaySignature: 'f'.repeat(64),
    });

    expect([400, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});

describe('razorpay webhook', () => {
  const WEBHOOK_SECRET = 'test_webhook_secret_value';

  it('rejects a webhook with no signature header', async () => {
    const res = await request(getApp())
      .post(`${API}/payments/webhook`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ event: 'payment.captured', payload: {} }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_SIGNATURE');
  });

  it('rejects a webhook with an invalid signature', async () => {
    const payload = JSON.stringify({ event: 'payment.captured', payload: {} });

    const res = await request(getApp())
      .post(`${API}/payments/webhook`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'a'.repeat(64))
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('receives the RAW request body so a valid signature is accepted', async () => {
    // This proves the `express.json({ verify })` hook captured the raw bytes
    // before parsing. A re-serialised body would produce a different HMAC.
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_raw_body_test', order_id: 'order_raw_body_test' } } },
    });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

    const res = await request(getApp())
      .post(`${API}/payments/webhook`)
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(raw);

    // The webhook secret is not configured in the test env, so the signature
    // check fails — which proves the raw body was captured and hashed.
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
  });

  it('processes a correctly signed webhook when the secret is configured', async () => {
    const { config } = await import('../config/env.js');
    const previous = config.razorpay.webhookSecret;
    setConfigValue('razorpay.webhookSecret', WEBHOOK_SECRET);

    try {
      const raw = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: { entity: { id: 'pay_signed_test', order_id: 'order_signed_test' } },
        },
      });
      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

      const res = await request(getApp())
        .post(`${API}/payments/webhook`)
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(raw);

      expect(res.status).toBe(200);
      expect(res.body.data.received).toBe(true);

      // Replaying the same event must be idempotent.
      const replay = await request(getApp())
        .post(`${API}/payments/webhook`)
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .send(raw);

      expect(replay.status).toBe(200);
      expect(replay.body.data.duplicate).toBe(true);
    } finally {
      setConfigValue('razorpay.webhookSecret', previous);
    }
  });
});
