import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
/** Attaches a unique request id and a request-scoped logger. */
export function requestId(req, res, next) {
    const incoming = req.headers['x-request-id'];
    req.id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    res.setHeader('X-Request-Id', req.id);
    // Expose the id to the response helpers so it can be echoed in the body.
    res.locals.requestId = req.id;
    req.log = logger.child({ requestId: req.id });
    next();
}
export default requestId;
//# sourceMappingURL=requestId.js.map