/** Shared helpers for the API test suite. */
import request from 'supertest';
import { getApp } from './setup.js';
import { config } from '../config/env.js';

export const API = '/api/v1';

/**
 * The runtime config object is frozen by its `as const` type, but tests need to
 * flip feature flags (COD, webhook secrets) at runtime. This helper performs
 * the mutation in one place and keeps the cast out of the test bodies.
 *
 * Example: `setConfigValue('cod.enabled', true)`.
 */
export function setConfigValue(path: string, value: unknown): void {
  const parts = path.split('.');
  let target = config as unknown as Record<string, unknown>;

  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (typeof next !== 'object' || next === null) {
      throw new Error(`Cannot set "${path}" — "${part}" is not a settable object`);
    }
    target = next as Record<string, unknown>;
  }

  target[parts[parts.length - 1]] = value;
}

export const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'owner@example.com',
  password: process.env.ADMIN_PASSWORD ?? 'Admin@12345',
};

export interface Session {
  token: string;
  userId: string;
  role: string;
}

/** Generates a valid 10-digit test phone number. */
function testPhone(): string {
  return `9${Math.floor(Math.random() * 1_000_000_000)
    .toString()
    .padStart(9, '0')}`;
}

/** Registers a throwaway customer and returns an authenticated session. */
export async function registerCustomer(
  overrides: Partial<{ name: string; email: string; phone: string; password: string }> = {},
): Promise<Session> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const payload = {
    name: overrides.name ?? 'Test Customer',
    email: overrides.email ?? `customer.${suffix}@example.com`,
    phone: overrides.phone ?? testPhone(),
    password: overrides.password ?? 'Customer@12345',
  };

  const res = await request(getApp()).post(`${API}/auth/register`).send(payload);
  if (res.status !== 201) {
    throw new Error(`registerCustomer failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return {
    token: readCookie(res, 'accessToken'),
    userId: String(res.body.data.user.id),
    role: res.body.data.user.role,
  };
}

/** Signs in with the seeded admin account. */
export async function loginAdmin(): Promise<Session> {
  const res = await request(getApp())
    .post(`${API}/auth/login`)
    .send({ email: ADMIN.email, password: ADMIN.password });
  if (res.status !== 200) {
    throw new Error(`loginAdmin failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return {
    token: readCookie(res, 'accessToken'),
    userId: String(res.body.data.user.id),
    role: res.body.data.user.role,
  };
}

/** Extracts a cookie value from a supertest response. */
export function readCookie(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    const [key, ...rest] = pair.split('=');
    if (key?.trim() === name) return rest.join('=');
  }
  return '';
}

/** A valid shipping address used across the order tests. */
export const ADDRESS = {
  fullName: 'Test Customer',
  phone: '9876543210',
  line1: '12 Test Street',
  city: 'Your City',
  state: 'Your State',
  pincode: '000000',
};

/** Builds a valid order request body. */
export function orderBody(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ product: '', quantity: 1 }],
    shippingAddress: ADDRESS,
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    customerPhone: '9876543210',
    paymentMethod: 'razorpay',
    ...overrides,
  };
}
