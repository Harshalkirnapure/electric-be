import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';
import {
  API,
  ADDRESS,
  loginAdmin,
  registerCustomer,
  setConfigValue,
  type Session,
} from './helpers.js';
import { config } from '../config/env.js';

let customer: Session;
let admin: Session;
let cheapProductId: string;
let priceyProductId: string;

const originalCod = { enabled: config.cod.enabled, maxAmount: config.cod.maxAmount };

beforeAll(async () => {
  customer = await registerCustomer();
  admin = await loginAdmin();

  const list = await request(getApp()).get(`${API}/products`).query({ limit: 1 });
  priceyProductId = list.body.data[0]._id;

  // A cheap product so an order can be kept under the COD limit.
  const categories = await request(getApp()).get(`${API}/catalog/categories`);
  const cheap = await request(getApp())
    .post(`${API}/admin/products`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      name: `COD Cheap Item ${Date.now()}`,
      sku: `CODCHEAP-${Date.now()}`,
      category: categories.body.data[0]._id,
      price: 50,
      taxPercent: 0,
      stock: 20,
      unit: 'piece',
      isPublished: true,
    });
  cheapProductId = cheap.body.data._id;
});

afterAll(() => {
  setConfigValue('cod.enabled', originalCod.enabled);
  setConfigValue('cod.maxAmount', originalCod.maxAmount);
});

function auth(req: request.Test): request.Test {
  return req.set('Authorization', `Bearer ${customer.token}`);
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ product: priceyProductId, quantity: 1 }],
    shippingAddress: ADDRESS,
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerPhone: '9876543210',
    paymentMethod: 'cod',
    ...overrides,
  };
}

describe('cash on delivery', () => {
  it('is disabled by default', async () => {
    setConfigValue('cod.enabled', false);

    const res = await auth(request(getApp()).post(`${API}/orders`)).send(body());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COD_DISABLED');
  });

  it('accepts a COD order under the limit when enabled', async () => {
    setConfigValue('cod.enabled', true);
    setConfigValue('cod.maxAmount', 100);

    const res = await auth(request(getApp()).post(`${API}/orders`)).send(
      body({ items: [{ product: cheapProductId, quantity: 1 }] }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.payment.method).toBe('cod');
    expect(res.body.data.status).toBe('confirmed');
    expect(res.body.data.total).toBeLessThanOrEqual(100);
  });

  it('rejects a COD order above the limit with COD_AMOUNT_EXCEEDED', async () => {
    setConfigValue('cod.enabled', true);
    setConfigValue('cod.maxAmount', 100);

    const res = await auth(request(getApp()).post(`${API}/orders`)).send(
      body({ items: [{ product: priceyProductId, quantity: 1 }] }),
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COD_AMOUNT_EXCEEDED');
    expect(res.body.details.maxAmount).toBe(100);
    expect(res.body.details.orderTotal).toBeGreaterThan(100);
  });

  it('rejects a COD order whose total is exactly one rupee over the limit', async () => {
    setConfigValue('cod.enabled', true);
    // The cheap item costs 50 + 49 delivery = 99. A limit of 98 must reject it.
    setConfigValue('cod.maxAmount', 98);

    const res = await auth(request(getApp()).post(`${API}/orders`)).send(
      body({ items: [{ product: cheapProductId, quantity: 1 }] }),
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COD_AMOUNT_EXCEEDED');
  });

  it('still allows an online order above the COD limit', async () => {
    setConfigValue('cod.enabled', true);
    setConfigValue('cod.maxAmount', 100);

    const res = await auth(request(getApp()).post(`${API}/orders`)).send(
      body({ paymentMethod: 'razorpay' }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.payment.method).toBe('razorpay');
  });

  it('reports the COD flag in the public delivery configuration', async () => {
    setConfigValue('cod.enabled', true);
    setConfigValue('cod.maxAmount', 100);

    const res = await request(getApp()).get(`${API}/delivery/config`);

    expect(res.status).toBe(200);
    expect(res.body.data.codEnabled).toBe(true);
    expect(res.body.data.codMaxAmount).toBe(100);
  });
});
