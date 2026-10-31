import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';
import { API, ADDRESS, registerCustomer, type Session } from './helpers.js';

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

function body(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ product: productId, quantity: 1 }],
    shippingAddress: ADDRESS,
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerPhone: '9876543210',
    paymentMethod: 'razorpay',
    ...overrides,
  };
}

describe('orders', () => {
  it('requires authentication', async () => {
    const res = await request(getApp()).post(`${API}/orders`).send(body());

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('creates an order with server-calculated pricing', async () => {
    const res = await auth(request(getApp()).post(`${API}/orders`)).send(body());

    expect(res.status).toBe(201);
    expect(res.body.data.orderNumber).toBeTruthy();
    expect(res.body.data.status).toBe('pending_payment');
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.payment.method).toBe('razorpay');
    expect(res.body.data.payment.status).toBe('pending');
    expect(res.body.data.items).toHaveLength(1);
  });

  it('reserves stock when the order is placed', async () => {
    const before = await request(getApp()).get(`${API}/products`).query({ limit: 100 });
    const stockBefore = before.body.data.find((p: { _id: string }) => p._id === productId).stock;

    await auth(request(getApp()).post(`${API}/orders`)).send(body({
      items: [{ product: productId, quantity: 2 }],
    }));

    const after = await request(getApp()).get(`${API}/products`).query({ limit: 100 });
    const stockAfter = after.body.data.find((p: { _id: string }) => p._id === productId).stock;

    expect(stockAfter).toBe(stockBefore - 2);
  });

  it('ignores a client-supplied price and uses the server price', async () => {
    const list = await request(getApp()).get(`${API}/products`).query({ limit: 1 });
    const product = list.body.data[0];

    const res = await auth(request(getApp()).post(`${API}/orders`)).send(
      body({
        items: [{ product: productId, quantity: 1, price: 1, unitPrice: 1 }],
        subtotal: 1,
        total: 1,
      }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.total).not.toBe(1);
    expect(res.body.data.items[0].unitPrice).toBe(product.price);
  });

  it('is idempotent for the same idempotency key', async () => {
    const key = `idem-${Date.now()}`;

    const first = await auth(request(getApp()).post(`${API}/orders`)).send(body({ idempotencyKey: key }));
    const second = await auth(request(getApp()).post(`${API}/orders`)).send(body({ idempotencyKey: key }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data._id).toBe(first.body.data._id);
    expect(second.body.data.orderNumber).toBe(first.body.data.orderNumber);
  });

  it('rejects an order for an unpublished or unknown product', async () => {
    const res = await auth(request(getApp()).post(`${API}/orders`)).send(
      body({ items: [{ product: '507f1f77bcf86cd799439011', quantity: 1 }] }),
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCT_UNAVAILABLE');
  });

  it('rejects an order that exceeds the available stock', async () => {
    const res = await auth(request(getApp()).post(`${API}/orders`)).send(
      body({ items: [{ product: productId, quantity: 999 }] }),
    );

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('rejects an empty cart', async () => {
    const res = await auth(request(getApp()).post(`${API}/orders`)).send(body({ items: [] }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects COD while COD is disabled', async () => {
    const res = await auth(request(getApp()).post(`${API}/orders`)).send(body({ paymentMethod: 'cod' }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COD_DISABLED');
  });

  it('clears the server-side cart after checkout', async () => {
    const cart = await auth(request(getApp()).get(`${API}/cart`));

    expect(cart.status).toBe(200);
    expect(cart.body.data.items).toHaveLength(0);
  });

  it('lists only the signed-in customer orders', async () => {
    const res = await auth(request(getApp()).get(`${API}/orders/my-orders`));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThan(0);

    const other = await registerCustomer();
    const otherOrders = await request(getApp())
      .get(`${API}/orders/my-orders`)
      .set('Authorization', `Bearer ${other.token}`);

    expect(otherOrders.body.meta.total).toBe(0);
  });

  it('fetches an owned order by id', async () => {
    const created = await auth(request(getApp()).post(`${API}/orders`)).send(body());
    const res = await auth(request(getApp()).get(`${API}/orders/${created.body.data._id}`));

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(created.body.data._id);
  });

  it('denies access to another customer order', async () => {
    const created = await auth(request(getApp()).post(`${API}/orders`)).send(body());
    const other = await registerCustomer();

    const res = await request(getApp())
      .get(`${API}/orders/${created.body.data._id}`)
      .set('Authorization', `Bearer ${other.token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORDER_ACCESS_DENIED');
  });

  it('cancels an order and restores the reserved stock', async () => {
    const before = await request(getApp()).get(`${API}/products`).query({ limit: 100 });
    const stockBefore = before.body.data.find((p: { _id: string }) => p._id === productId).stock;

    const created = await auth(request(getApp()).post(`${API}/orders`)).send(
      body({ items: [{ product: productId, quantity: 2 }] }),
    );

    const res = await auth(request(getApp()).post(`${API}/orders/${created.body.data._id}/cancel`)).send({
      reason: 'Changed my mind',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');

    const after = await request(getApp()).get(`${API}/products`).query({ limit: 100 });
    const stockAfter = after.body.data.find((p: { _id: string }) => p._id === productId).stock;
    expect(stockAfter).toBe(stockBefore);
  });

  it('rejects a cancel with a too-short reason', async () => {
    const created = await auth(request(getApp()).post(`${API}/orders`)).send(body());
    const res = await auth(request(getApp()).post(`${API}/orders/${created.body.data._id}/cancel`)).send({
      reason: 'no',
    });

    expect(res.status).toBe(422);
  });

  it('rejects cancelling an order twice', async () => {
    const created = await auth(request(getApp()).post(`${API}/orders`)).send(body());
    await auth(request(getApp()).post(`${API}/orders/${created.body.data._id}/cancel`)).send({
      reason: 'First cancel',
    });

    const res = await auth(request(getApp()).post(`${API}/orders/${created.body.data._id}/cancel`)).send({
      reason: 'Second cancel',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ORDER_NOT_CANCELLABLE');
  });
});
