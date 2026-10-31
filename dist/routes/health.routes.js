import { Router } from 'express';
import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import { config } from '../config/env.js';
const router = Router();
/** GET /api/v1/health — liveness/readiness probe. */
router.get('/', asyncHandler(async (req, res) => {
    let database = 'disconnected';
    if (mongoose.connection.readyState === 1)
        database = 'connected';
    else if (mongoose.connection.readyState === 2)
        database = 'disconnected';
    const healthy = database === 'connected';
    res.status(healthy ? 200 : 503).json({
        success: healthy,
        message: healthy ? 'Service is healthy' : 'Service is running but the database is unavailable',
        data: {
            status: healthy ? 'healthy' : 'degraded',
            database,
            environment: config.env,
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
        },
        requestId: req.id,
    });
}));
export default router;
//# sourceMappingURL=health.routes.js.map