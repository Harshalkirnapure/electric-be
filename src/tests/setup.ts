/**
 * Global test setup.
 *
 * Boots a single in-memory MongoDB for the whole suite, seeds it with the
 * catalog/admin fixtures, and exposes the Express app to the test files.
 *
 * NOTE: the environment variables are set in `vitest.config.ts` under
 * `test.env`, because `config/env.ts` reads `process.env` the moment it is
 * first evaluated — assigning them here would be too late.
 */
import { afterAll, beforeAll } from 'vitest';
import type { Application } from 'express';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { createApp } from '../app.js';
import { runSeed } from '../scripts/seed.js';
import '../models/index.js';

let app: Application;

beforeAll(async () => {
  await connectDatabase();
  await runSeed();
  app = createApp();
});

afterAll(async () => {
  await disconnectDatabase();
});

export function getApp(): Application {
  if (!app) throw new Error('Express app is not initialised — is the setup file registered?');
  return app;
}
