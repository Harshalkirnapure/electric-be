import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';
import { API } from './helpers.js';

describe('health & catalog', () => {
  it('reports a healthy service with a connected database', async () => {
    const res = await request(getApp()).get(`${API}/health`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.database).toBe('connected');
  });

  it('lists the seeded catalogue with 20 published products', async () => {
    const res = await request(getApp()).get(`${API}/products`).query({ limit: 100 });

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(20);
    expect(res.body.data).toHaveLength(20);
  });

  it('gives every product a unique SKU', async () => {
    const res = await request(getApp()).get(`${API}/products`).query({ limit: 100 });
    const skus = res.body.data.map((p: { sku: string }) => p.sku);

    expect(new Set(skus).size).toBe(skus.length);
  });

  it('exposes categories and brands', async () => {
    const categories = await request(getApp()).get(`${API}/catalog/categories`);
    const brands = await request(getApp()).get(`${API}/catalog/brands`);

    expect(categories.status).toBe(200);
    expect(categories.body.data.length).toBeGreaterThan(0);
    expect(brands.status).toBe(200);
    expect(brands.body.data.length).toBeGreaterThan(0);
  });

  it('returns featured, best-seller and latest collections', async () => {
    const featured = await request(getApp()).get(`${API}/products/featured`);
    const best = await request(getApp()).get(`${API}/products/best-sellers`);
    const latest = await request(getApp()).get(`${API}/products/latest`);

    expect(featured.status).toBe(200);
    expect(best.status).toBe(200);
    expect(latest.status).toBe(200);
    expect(featured.body.data.length).toBeGreaterThan(0);
  });

  it('fetches a single product by slug', async () => {
    const list = await request(getApp()).get(`${API}/products`).query({ limit: 1 });
    const slug = list.body.data[0].slug;

    const res = await request(getApp()).get(`${API}/products/${slug}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product.slug).toBe(slug);
    expect(Array.isArray(res.body.data.related)).toBe(true);
  });

  it('returns 404 for an unknown product slug', async () => {
    const res = await request(getApp()).get(`${API}/products/does-not-exist-at-all`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('searches by the `q` alias and by `search`', async () => {
    const list = await request(getApp()).get(`${API}/products`).query({ limit: 1 });
    const term = list.body.data[0].name.split(' ')[0];

    const byQ = await request(getApp()).get(`${API}/products/search`).query({ q: term });
    const bySearch = await request(getApp()).get(`${API}/products/search`).query({ search: term });

    expect(byQ.status).toBe(200);
    expect(byQ.body.meta.total).toBeGreaterThan(0);
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.meta.total).toBeGreaterThan(0);
  });

  it('rejects an empty search term', async () => {
    const res = await request(getApp()).get(`${API}/products/search`).query({ q: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMPTY_SEARCH');
  });

  it('filters by category slug and price range', async () => {
    const res = await request(getApp())
      .get(`${API}/products`)
      .query({ minPrice: 100, maxPrice: 5000, limit: 50 });

    expect(res.status).toBe(200);
    for (const product of res.body.data) {
      expect(product.price).toBeGreaterThanOrEqual(100);
      expect(product.price).toBeLessThanOrEqual(5000);
    }
  });

  it('sorts by price ascending', async () => {
    const res = await request(getApp())
      .get(`${API}/products`)
      .query({ sort: 'price_asc', limit: 20 });

    expect(res.status).toBe(200);
    const prices = res.body.data.map((p: { price: number }) => p.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});
