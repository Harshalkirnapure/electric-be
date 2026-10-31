import mongoose from 'mongoose';
import { config } from './env.js';
import logger from '../utils/logger.js';

let memoryServer: { stop: () => Promise<boolean> } | null = null;

export async function connectDatabase(): Promise<typeof mongoose> {
  let uri = config.mongoUri;

  if (config.useMemoryDb) {
    // In-memory MongoDB: no local installation required (development / tests).
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create({ instance: { dbName: config.memoryDbName } });
    memoryServer = mem as unknown as { stop: () => Promise<boolean> };
    uri = mem.getUri(config.memoryDbName);
    logger.warn('Using in-memory MongoDB instance (data is not persisted)', { uri });
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: config.env !== 'production',
  });

  logger.info('MongoDB connected', { database: mongoose.connection.name });

  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { error: err }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

/**
 * True when the deployment supports multi-document transactions
 * (replica set or sharded cluster). Standalone mongod does NOT.
 */
export function supportsTransactions(): boolean {
  const host = config.mongoUri;
  if (config.useMemoryDb) return true; // memory server runs as a single-node replica set
  if (host.includes('mongodb+srv')) return true;
  return /replicaSet=/.test(host);
}

/**
 * Run a callback inside a transaction when the deployment supports it,
 * otherwise fall back to running the callback without a transaction.
 * Callbacks must therefore be written so that they are safe either way
 * (idempotent, and using atomic `$inc` stock updates).
 */
export async function withOptionalTransaction<T>(
  fn: (session: mongoose.ClientSession | null) => Promise<T>,
): Promise<T> {
  if (!supportsTransactions()) {
    logger.warn('Transactions unavailable on this deployment — running without session', {
      fallback: true,
    });
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
