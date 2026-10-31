import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const boolish = z
    .union([z.boolean(), z.string()])
    .transform((v) => typeof v === 'boolean' ? v : ['true', '1', 'yes', 'on'].includes(String(v).trim().toLowerCase()));
const csv = z
    .string()
    .optional()
    .transform((v) => (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean));
const numberish = z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : Number(v)))
    .refine((v) => v === undefined || Number.isFinite(v), { message: 'Must be a number' });
const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: numberish.default(5000),
    API_PREFIX: z.string().default('/api/v1'),
    CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
    MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/electrical_store'),
    MONGODB_MEMORY: boolish.default(false),
    JWT_ACCESS_SECRET: z.string().min(16).default('dev_only_access_secret_change_me'),
    JWT_REFRESH_SECRET: z.string().min(16).default('dev_only_refresh_secret_change_me'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),
    COOKIE_DOMAIN: z.string().optional().default(''),
    COOKIE_SECURE: z.string().default('auto'),
    ADMIN_EMAIL: z.string().email().default('owner@example.com'),
    ADMIN_PASSWORD: z.string().default('Admin@12345'),
    ADMIN_NAME: z.string().default('Store Owner'),
    STORE_NAME: z.string().default('VoltCart Electricals'),
    STORE_PHONE: z.string().default('+91 90000 00000'),
    STORE_WHATSAPP: z.string().default('919000000000'),
    STORE_ADDRESS_LINE: z.string().default('Shop No. 1, Main Market Road'),
    STORE_CITY: z.string().default('Your City'),
    STORE_STATE: z.string().default('Your State'),
    STORE_PINCODE: z.string().default('000000'),
    STORE_LAT: numberish,
    STORE_LNG: numberish,
    DELIVERY_RADIUS_KM: numberish.default(60),
    LOCAL_DELIVERY_CHARGE: numberish.default(49),
    FREE_DELIVERY_ABOVE: numberish.default(999),
    ALLOWED_PIN_CODES: csv,
    COD_ENABLED: boolish.default(false),
    COD_MAX_AMOUNT: numberish.default(50000),
    RAZORPAY_KEY_ID: z.string().optional().default(''),
    RAZORPAY_KEY_SECRET: z.string().optional().default(''),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
    RAZORPAY_REFUND_ENABLED: boolish.default(true),
    CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
    CLOUDINARY_API_KEY: z.string().optional().default(''),
    CLOUDINARY_API_SECRET: z.string().optional().default(''),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`[config] Invalid environment variables:\n${issues}`);
    process.exit(1);
}
const env = parsed.data;
export const config = {
    env: env.NODE_ENV,
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    clientOrigin: env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
    mongoUri: env.MONGODB_URI,
    useMemoryDb: env.MONGODB_MEMORY,
    memoryDbName: 'electrical_store_test',
    jwt: {
        accessSecret: env.JWT_ACCESS_SECRET,
        refreshSecret: env.JWT_REFRESH_SECRET,
        accessTtl: env.JWT_ACCESS_TTL,
        refreshTtl: env.JWT_REFRESH_TTL,
    },
    cookie: {
        domain: env.COOKIE_DOMAIN || undefined,
        secure: env.COOKIE_SECURE === 'true' ? true : env.COOKIE_SECURE === 'false' ? false : env.NODE_ENV === 'production',
    },
    admin: {
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
        name: env.ADMIN_NAME,
    },
    store: {
        name: env.STORE_NAME,
        phone: env.STORE_PHONE,
        whatsapp: env.STORE_WHATSAPP,
        addressLine: env.STORE_ADDRESS_LINE,
        city: env.STORE_CITY,
        state: env.STORE_STATE,
        pincode: env.STORE_PINCODE,
        lat: env.STORE_LAT,
        lng: env.STORE_LNG,
        deliveryRadiusKm: env.DELIVERY_RADIUS_KM,
        localDeliveryCharge: env.LOCAL_DELIVERY_CHARGE,
        freeDeliveryAbove: env.FREE_DELIVERY_ABOVE,
        allowedPinCodes: env.ALLOWED_PIN_CODES,
        codEnabled: env.COD_ENABLED,
    },
    cod: {
        enabled: env.COD_ENABLED,
        maxAmount: env.COD_MAX_AMOUNT,
    },
    razorpay: {
        keyId: env.RAZORPAY_KEY_ID,
        keySecret: env.RAZORPAY_KEY_SECRET,
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
        refundEnabled: env.RAZORPAY_REFUND_ENABLED,
    },
    cloudinary: {
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        apiSecret: env.CLOUDINARY_API_SECRET,
    },
    logLevel: env.LOG_LEVEL,
};
//# sourceMappingURL=env.js.map