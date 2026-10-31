/**
 * Structured application logger.
 * Emits single-line JSON in production (easy for log collectors) and a
 * human-readable format in development. Every request carries a requestId
 * which is attached to child loggers via `req.log`.
 */
const LEVEL_WEIGHT = { error: 0, warn: 1, info: 2, debug: 3 };
const levelColors = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[36m',
    debug: '\x1b[35m',
};
let currentLevel = 'info';
export function setLogLevel(level) {
    currentLevel = level;
}
function serializeError(error) {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
}
function write(level, message, meta = {}) {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[currentLevel])
        return;
    const payload = {
        level,
        time: new Date().toISOString(),
        message,
        ...meta,
    };
    if (currentLevel === 'debug' && meta.error) {
        payload.error = serializeError(meta.error);
        delete meta.error;
    }
    if (process.env.NODE_ENV === 'production') {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(payload));
        return;
    }
    const { level: _l, time, ...rest } = payload;
    const color = levelColors[level];
    // eslint-disable-next-line no-console
    console.log(`${color}${level.toUpperCase().padEnd(5)}\x1b[0m ${time} ${message}${Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''}`);
}
export const logger = {
    error: (m, meta) => write('error', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    info: (m, meta) => write('info', m, meta),
    debug: (m, meta) => write('debug', m, meta),
    child(bindings) {
        return {
            error: (m, meta) => write('error', m, { ...bindings, ...meta }),
            warn: (m, meta) => write('warn', m, { ...bindings, ...meta }),
            info: (m, meta) => write('info', m, { ...bindings, ...meta }),
            debug: (m, meta) => write('debug', m, { ...bindings, ...meta }),
            child(extra) {
                return logger.child({ ...bindings, ...extra });
            },
        };
    },
};
export default logger;
//# sourceMappingURL=logger.js.map