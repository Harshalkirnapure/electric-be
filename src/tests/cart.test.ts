import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';
import { API, registerCustomer, type Session } from './helpers.js';

let session: Session;
let productId: string;
let secondProductId: string;

beforeAll(async () => {
  session = await registerCustomer();
  const list = await request(getApp()).get(`${API}/products`).query({ limit: 2 });
  productId = list.body.data[0]._id;
  secondProductId = list.body.data[1]._id;
});

function auth(req: request.Test): request.Test {
  return req.set('Authorization', `Bearer ${session.token}`);
}

/** Returns the current stock of a product by id. */
async function stockOf(id: string): Promise<number> {
  const res = await request(getApp()).get(`${API}/products`).query({ limit: 100 });
  const product = res.body.data.find((p: { _id: string }) => p._id === id);
  return product?.stock ?? 0;
}

describe('cart', () => {
  it('requires authentication', async () => {
    const res = await request(getApp()).get(`${API}/cart`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('adds a product to the cart', async () => {
    const res = await auth(request(getApp()).post(`${API}/cart/items`)).send({
      product: productId,
      quantity: 1,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.itemCount).toBe(1);
    expect(res.body.data.totalItems).toBe(1);
    expect(res.body.data.total).toBeGreaterThan(0);
  });

  it('accumulates the quantity when the same product is added again', async () => {
    const res = await auth(request(getApp()).post(`${API}/cart/items`)).send({
      product: productId,
      quantity: 2,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.totalItems).toBe(3);
  });

  it('reads the cart back', async () => {
    const res = await auth(request(getApp()).get(`${API}/cart`));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.totalItems).toBe(3);
  });

  it('sets an absolute quantity on PATCH', async () => {
    const res = await auth(request(getApp()).patch(`${API}/cart/items/${productId}`)).send({
      quantity: 5,
    });

    expect(res.status).toBe(200);
    const item = res.body.data.items.find((i: { product: { _id: string } }) => i.product._id === productId);
    expect(item.quantity).toBe(5);
    expect(res.body.data.totalItems).toBe(5);
  });

  it('rejects a quantity above the available stock', async () => {
    const available = await stockOf(productId);

    const res = await auth(request(getApp()).patch(`${API}/cart/items/${productId}`)).send({
      quantity: available + 1,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('rejects an unknown product', async () => {
    const res = await auth(request(getApp()).post(`${API}/cart/items`)).send({
      product: '507f1f77bcf86cd799439011',
      quantity: 1,
    });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('REPLACES the cart on PUT instead of accumulating it', async () => {
    // Seed a two-line cart first.
    await auth(request(getApp()).put(`${API}/cart/items`)).send({
      items: [
        { product: productId, quantity: 4 },
        { product: secondProductId, quantity: 2 },
      ],
    });

    const res = await auth(request(getApp()).put(`${API}/cart/items`)).send({
      items: [{ product: productId, quantity: 1 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].product._id).toBe(productId);
    expect(res.body.data.items[0].quantity).toBe(1);
    expect(res.body.data.totalItems).toBe(1);
  });

  it('merges duplicate lines on PUT so the total cannot be smuggled', async () => {
    const res = await auth(request(getApp()).put(`${API}/cart/items`)).send({
      items: [
        { product: productId, quantity: 1 },
        { product: productId, quantity: 2 },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(3);
  });

  it('validates stock on PUT and leaves the cart untouched when it fails', async () => {
    const before = await auth(request(getApp()).get(`${API}/cart`));
    const available = await stockOf(productId);

    const res = await auth(request(getApp()).put(`${API}/cart/items`)).send({
      items: [{ product: productId, quantity: available + 1 }],
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');

    const after = await auth(request(getApp()).get(`${API}/cart`));
    expect(after.body.data.totalItems).toBe(before.body.data.totalItems);
  });

  it('removes a single line', async () => {
    await auth(request(getApp()).put(`${API}/cart/items`)).send({
      items: [{ product: productId, quantity: 1 }],
    });

    const res = await auth(request(getApp()).delete(`${API}/cart/items/${productId}`));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.totalItems).toBe(0);
  });

  it('clears the whole cart', async () => {
    await auth(request(getApp()).post(`${API}/cart/items`)).send({
      product: productId,
      quantity: 1,
    });

    const res = await auth(request(getApp()).delete(`${API}/cart`));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.totalItems).toBe(0);
  });
});
