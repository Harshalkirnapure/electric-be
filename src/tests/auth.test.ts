import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './setup.js';
import { API, ADMIN, readCookie, registerCustomer } from './helpers.js';

describe('authentication', () => {
  it('registers a customer and issues an access cookie', async () => {
    const email = `auth.${Date.now()}@example.com`;
    const res = await request(getApp()).post(`${API}/auth/register`).send({
      name: 'Auth Tester',
      email,
      phone: '9876500011',
      password: 'Customer@12345',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.role).toBe('customer');
    expect(readCookie(res, 'accessToken')).toBeTruthy();
  });

  it('rejects a duplicate email', async () => {
    const email = `dupe.${Date.now()}@example.com`;
    const payload = {
      name: 'Dupe Tester',
      email,
      phone: '9876500022',
      password: 'Customer@12345',
    };

    await request(getApp()).post(`${API}/auth/register`).send(payload);
    const res = await request(getApp()).post(`${API}/auth/register`).send(payload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a weak password', async () => {
    const res = await request(getApp()).post(`${API}/auth/register`).send({
      name: 'Weak Pass',
      email: `weak.${Date.now()}@example.com`,
      phone: '9876500033',
      password: 'short',
    });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('never lets a caller escalate their own role', async () => {
    // `role: 'admin'` is rejected outright by the request schema.
    const rejected = await request(getApp()).post(`${API}/auth/register`).send({
      name: 'Escalator',
      email: `esc.${Date.now()}@example.com`,
      phone: '9876500044',
      password: 'Customer@12345',
      role: 'admin',
    });

    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe('VALIDATION_ERROR');

    // Supplying the only accepted value still yields a customer.
    const accepted = await request(getApp()).post(`${API}/auth/register`).send({
      name: 'Escalator',
      email: `esc2.${Date.now()}@example.com`,
      phone: '9876500045',
      password: 'Customer@12345',
      role: 'customer',
    });

    expect(accepted.status).toBe(201);
    expect(accepted.body.data.user.role).toBe('customer');
  });

  it('logs a customer in with valid credentials', async () => {
    const email = `login.${Date.now()}@example.com`;
    await request(getApp()).post(`${API}/auth/register`).send({
      name: 'Login Tester',
      email,
      phone: '9876500055',
      password: 'Customer@12345',
    });

    const res = await request(getApp())
      .post(`${API}/auth/login`)
      .send({ email, password: 'Customer@12345' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
    expect(readCookie(res, 'accessToken')).toBeTruthy();
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(getApp())
      .post(`${API}/auth/login`)
      .send({ email: ADMIN.email, password: 'Wrong@12345' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs the seeded admin in with the admin role', async () => {
    const res = await request(getApp())
      .post(`${API}/auth/login`)
      .send({ email: ADMIN.email, password: ADMIN.password });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');
    expect(readCookie(res, 'accessToken')).toBeTruthy();
  });

  it('returns the current user from /auth/me', async () => {
    const session = await registerCustomer();
    const res = await request(getApp())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${session.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(session.userId);
  });

  it('rejects /auth/me without a token', async () => {
    const res = await request(getApp()).get(`${API}/auth/me`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('rejects a tampered access token', async () => {
    const session = await registerCustomer();
    const res = await request(getApp())
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${session.token}tampered`);

    expect(res.status).toBe(401);
  });

  it('does not enumerate accounts on forgot-password', async () => {
    const known = await request(getApp())
      .post(`${API}/auth/forgot-password`)
      .send({ email: ADMIN.email });
    const unknown = await request(getApp())
      .post(`${API}/auth/forgot-password`)
      .send({ email: 'nobody.here@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body.message).toBe(known.body.message);
  });

  it('resets a password with a valid token and can sign in again', async () => {
    const email = `reset.${Date.now()}@example.com`;
    await request(getApp()).post(`${API}/auth/register`).send({
      name: 'Reset Tester',
      email,
      phone: '9876500066',
      password: 'Customer@12345',
    });

    const forgot = await request(getApp())
      .post(`${API}/auth/forgot-password`)
      .send({ email });
    const token = forgot.body.data.resetToken as string;
    expect(token).toBeTruthy();

    const reset = await request(getApp())
      .post(`${API}/auth/reset-password`)
      .send({ token, password: 'NewPass@12345' });
    expect(reset.status).toBe(200);

    const login = await request(getApp())
      .post(`${API}/auth/login`)
      .send({ email, password: 'NewPass@12345' });
    expect(login.status).toBe(200);
  });

  it('rejects an invalid reset token', async () => {
    const res = await request(getApp())
      .post(`${API}/auth/reset-password`)
      .send({ token: 'x'.repeat(40), password: 'NewPass@12345' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');
  });

  it('clears the auth cookies on logout', async () => {
    const res = await request(getApp()).post(`${API}/auth/logout`).send({});

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => /accessToken=;/.test(c))).toBe(true);
  });
});
