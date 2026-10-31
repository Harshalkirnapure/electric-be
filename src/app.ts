import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { requestId } from './middlewares/requestId.js';
import { apiLimiter } from './middlewares/rateLimit.js';
import logger from './utils/logger.js';

export function createApp(): Application {
  const app = express();

  // Behind a proxy (nginx / Render / Railway) so req.ip and secure cookies work.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: config.env === 'production' ? undefined : false,
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin/non-browser requests (curl, health checks).
        if (!origin) return callback(null, true);
        if (config.clientOrigin.includes(origin)) return callback(null, true);
        if (config.env !== 'production') return callback(null, true);
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86400,
    }),
  );

  // Webhooks need the raw body for signature verification.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  if (config.env !== 'test') {
    app.use(
      morgan(':method :url :status :response-time ms', {
        stream: { write: (message: string) => logger.info(message.trim()) },
        skip: (req) => req.url === '/api/v1/health',
      }),
    );
  }

  app.use(config.apiPrefix, apiLimiter, routes);

  // Root probe (outside the versioned prefix).
  app.get('/', (req: Request, res: Response) => {
    res.json({
      success: true,
      message: `${config.store.name} API`,
      data: { apiPrefix: config.apiPrefix, health: `${config.apiPrefix}/health` },
      requestId: req.id,
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
