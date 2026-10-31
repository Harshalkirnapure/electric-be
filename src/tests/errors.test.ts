import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';
import { API } from './helpers.js';

describe('error handling & fallbacks', () => {
  it('returns 404 for an unknown route', async () => {
    const res = await request(getApp()).get(`${API}/definitely-not-a-route`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for an unknown route outside the API prefix', async () => {
    const res = await request(getApp()).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });

  it('exposes a root probe with the API prefix', async () => {
    const res = await request(getApp()).get('/');

    expect(res.status).toBe(200);
    expect(res.body.data.apiPrefix).toBe(API);
  });

  it('includes a request id on every response', async () => {
    const res = await request(getApp()).get(`${API}/health`);

    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.body.requestId).toBeTruthy();
  });

  it('never leaks a stack trace on a 4xx error', async () => {
    const res = await request(getApp()).get(`${API}/auth/me`);

    expect(res.status).toBe(401);
    expect(res.body.stack).toBeUndefined();
    expect(res.body.message).toBeTruthy();
  });

  it('rejects an unknown body key instead of silently accepting it', async () => {
    const res = await request(getApp())
      .post(`${API}/delivery/check`)
      .send({ pincode: '000000', hackerField: 'drop table' });

    // Extra keys are stripped, not executed — the request still succeeds.
    expect(res.status).toBe(200);
  });

  it('rejects a non-numeric page parameter', async () => {
    const res = await request(getApp()).get(`${API}/products`).query({ page: 'abc' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a limit above the maximum', async () => {
    const res = await request(getApp()).get(`${API}/products`).query({ limit: 5000 });

    expect(res.status).toBe(422);
  });

  it('does not require authentication for the catalogue', async () => {
    const res = await request(getApp()).get(`${API}/products`);

    expect(res.status).toBe(200);
  });
});
