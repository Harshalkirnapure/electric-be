import { z } from 'zod';
import { objectIdSchema } from './common.js';
export const createCategorySchema = z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    image: z.string().url().optional().or(z.literal('')),
    icon: z.string().trim().max(60).optional(),
    parent: objectIdSchema.optional().nullable(),
    displayOrder: z.coerce.number().int().default(0),
    isActive: z.boolean().default(true),
});
export const updateCategorySchema = createCategorySchema.partial();
export const createBrandSchema = z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    logo: z.string().url().optional().or(z.literal('')),
    isActive: z.boolean().default(true),
});
export const updateBrandSchema = createBrandSchema.partial();
export const categoryParamsSchema = z.object({ id: objectIdSchema });
//# sourceMappingURL=catalog.validator.js.map