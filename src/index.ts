import { createServer } from 'node:http';
import createApp from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { setLogLevel } from './utils/logger.js';
import './models/index.js';

async function bootstrap(): Promise<void> {
  setLogLevel(config.logLevel as never);

  await connectDatabase();

  const app = createApp();
  const server = createServer(app);

  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `\n  ${config.store.name} API ready\n  → http://localhost:${config.port}${config.apiPrefix}\n  → health: http://localhost:${config.port}${config.apiPrefix}/health\n  → env: ${config.env}\n`,
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Force-exit if connections hang.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('Unhandled promise rejection:', reason);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
