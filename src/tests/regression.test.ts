import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';

describe('regression — critical customer journeys (unauthenticated)', () => {
  describe('authentication endpoints', () => {
    it('should reject order creation without authentication', async () => {
      const res = await request(getApp()).post('/api/v1/orders');
      expect(res.status).toBe(401);
    });

    it('should reject cart access without authentication', async () => {
      const res = await request(getApp()).get('/api/v1/cart');
      expect(res.status).toBe(401);
    });

    it('should reject auth me without token', async () => {
      const res = await request(getApp()).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
