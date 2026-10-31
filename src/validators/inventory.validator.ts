import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { ADJUSTMENT_TYPES } from '../models/InventoryAdjustment.js';

export const inventoryAdjustmentSchema = z.object({
  product: objectIdSchema,
  type: z.enum(ADJUSTMENT_TYPES),
  quantity: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, 'Quantity cannot be zero'),
  reason: z.string().trim().min(3).max(300),
});

export const inventoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  outOfStock: z.enum(['true', 'false']).optional(),
  sort: z.enum(['stock_asc', 'stock_desc', 'name_asc', 'newest']).default('stock_asc'),
});

export const dashboardQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', '365d']).default('30d'),
});

export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;
