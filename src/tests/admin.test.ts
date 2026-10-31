import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';
import { API, loginAdmin, registerCustomer, type Session } from './helpers.js';

let admin: Session;
let customer: Session;
let categoryId: string;

beforeAll(async () => {
  admin = await loginAdmin();
  customer = await registerCustomer();
  const categories = await request(getApp()).get(`${API}/catalog/categories`);
  categoryId = categories.body.data[0]._id;
});

function asAdmin(req: request.Test): request.Test {
  return req.set('Authorization', `Bearer ${admin.token}`);
}

describe('admin authorisation', () => {
  it('rejects an unauthenticated admin request', async () => {
    const res = await request(getApp()).get(`${API}/admin/dashboard`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('rejects a customer requesting an admin route', async () => {
    const res = await request(getApp())
      .get(`${API}/admin/dashboard`)
      .set('Authorization', `Bearer ${customer.token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  it('rejects a customer creating a product', async () => {
    const res = await request(getApp())
      .post(`${API}/admin/products`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ name: 'Sneaky', sku: 'SNK-1', category: categoryId, price: 10 });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });
});

describe('admin dashboard & reporting', () => {
  it('returns the dashboard summary', async () => {
    const res = await asAdmin(request(getApp()).get(`${API}/admin/dashboard`));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data).toHaveProperty('orders');
  });

  it('lists all orders for the admin', async () => {
    const res = await asAdmin(request(getApp()).get(`${API}/admin/orders`));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns order statistics', async () => {
    const res = await asAdmin(request(getApp()).get(`${API}/admin/orders/stats`));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
  });

  it('lists payments', async () => {
    const res = await asAdmin(request(getApp()).get(`${API}/admin/payments`));

    expect(res.status).toBe(200);
  });

  it('lists inventory and low-stock alerts', async () => {
    const inventory = await asAdmin(request(getApp()).get(`${API}/admin/inventory`));
    const alerts = await asAdmin(request(getApp()).get(`${API}/admin/inventory/alerts`));

    expect(inventory.status).toBe(200);
    expect(alerts.status).toBe(200);
  });
});

describe('admin product management', () => {
  it('creates a product', async () => {
    const res = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send({
      name: `Test Bulb ${Date.now()}`,
      sku: `TST-BULB-${Date.now()}`,
      category: categoryId,
      price: 199,
      mrp: 249,
      stock: 25,
      taxPercent: 18,
      unit: 'piece',
      isPublished: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe(res.body.data.sku.toUpperCase());
    expect(res.body.data.price).toBe(199);
    expect(res.body.data.slug).toBeTruthy();
  });

  it('rejects a duplicate SKU', async () => {
    const sku = `DUP-${Date.now()}`;
    const payload = {
      name: `Duplicate ${Date.now()}`,
      sku,
      category: categoryId,
      price: 100,
      stock: 5,
    };

    const first = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send(payload);
    expect(first.status).toBe(201);

    const second = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send({
      ...payload,
      name: `Duplicate Two ${Date.now()}`,
    });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_SKU');
  });

  it('rejects a product with an unknown category', async () => {
    const res = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send({
      name: 'Bad Category',
      sku: `BADCAT-${Date.now()}`,
      category: '507f1f77bcf86cd799439011',
      price: 100,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CATEGORY');
  });

  it('updates a product price', async () => {
    const created = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send({
      name: `Price Test ${Date.now()}`,
      sku: `PRICE-${Date.now()}`,
      category: categoryId,
      price: 100,
      stock: 10,
    });

    const res = await asAdmin(
      request(getApp()).patch(`${API}/admin/products/${created.body.data._id}`),
    ).send({ price: 149 });

    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(149);
  });

  it('unpublishes a product so it leaves the storefront', async () => {
    const created = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send({
      name: `Unpublish Test ${Date.now()}`,
      sku: `UNPUB-${Date.now()}`,
      category: categoryId,
      price: 100,
      stock: 10,
      isPublished: true,
    });

    const res = await asAdmin(
      request(getApp()).patch(`${API}/admin/products/${created.body.data._id}/publish`),
    ).send({ isPublished: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isPublished).toBe(false);

    const publicList = await request(getApp()).get(`${API}/products`).query({ limit: 100 });
    const visible = publicList.body.data.find(
      (p: { _id: string }) => p._id === created.body.data._id,
    );
    expect(visible).toBeUndefined();
  });

  it('sets the stock level', async () => {
    const created = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send({
      name: `Stock Test ${Date.now()}`,
      sku: `STOCK-${Date.now()}`,
      category: categoryId,
      price: 100,
      stock: 10,
    });

    const res = await asAdmin(
      request(getApp()).patch(`${API}/admin/products/${created.body.data._id}/stock`),
    ).send({ stock: 42, reason: 'Restock' });

    expect(res.status).toBe(200);
    expect(res.body.data.stock).toBe(42);
  });

  it('rejects a negative stock level', async () => {
    const created = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send({
      name: `Negative Stock ${Date.now()}`,
      sku: `NEG-${Date.now()}`,
      category: categoryId,
      price: 100,
      stock: 10,
    });

    const res = await asAdmin(
      request(getApp()).patch(`${API}/admin/products/${created.body.data._id}/stock`),
    ).send({ stock: -5 });

    expect(res.status).toBe(422);
  });

  it('deletes a product', async () => {
    const created = await asAdmin(request(getApp()).post(`${API}/admin/products`)).send({
      name: `Delete Test ${Date.now()}`,
      sku: `DEL-${Date.now()}`,
      category: categoryId,
      price: 100,
      stock: 1,
    });

    const res = await asAdmin(
      request(getApp()).delete(`${API}/admin/products/${created.body.data._id}`),
    );

    expect(res.status).toBe(200);

    const after = await asAdmin(request(getApp()).get(`${API}/admin/products/${created.body.data._id}`));
    expect(after.status).toBe(404);
  });
});
