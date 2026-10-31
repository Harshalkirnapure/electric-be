/**
 * Boots the API against an in-memory MongoDB, seeds it, and stays running.
 * Used for smoke testing without a local MongoDB installation.
 */
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import createApp from '../app.js';
import { config } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { setLogLevel } from '../utils/logger.js';
import '../models/index.js';
import { runSeed } from './seed.js';

setLogLevel('warn');

await connectDatabase();
await runSeed();

const app = createApp();
const server = createServer(app);

server.listen(config.port, () => {
  console.log(`READY on http://localhost:${config.port}${config.apiPrefix}`);
});

const shutdown = async () => {
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

void mongoose;
