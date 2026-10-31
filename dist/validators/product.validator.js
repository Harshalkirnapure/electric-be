import { z } from 'zod';
import mongoose from 'mongoose';
import { PRODUCT_UNITS } from '../models/Product.js';
import { objectIdSchema } from './common.js';
export const productImageSchema = z.object({
    url: z.string().url('Invalid image URL'),
    publicId: z.string().optional(),
    alt: z.string().trim().max(200).optional(),
    isPrimary: z.boolean().optional(),
});
export const productSpecSchema = z.object({
    key: z.string().trim().min(1).max(60),
    value: z.string().trim().min(1).max(200),
});
export const createProductSchema = z.object({
    name: z.string().trim().min(2).max(200),
    sku: z.string().trim().min(2).max(60),
    /**
     * A category may be referenced by its ObjectId **or** by its slug
     * (e.g. "wires-cables"). The controller resolves either form.
     */
    category: z.string().trim().min(1, 'Select a category').max(80),
    brand: z.string().trim().min(1, 'Select a brand').max(80).optional().nullable(),
    shortDescription: z.string().trim().max(500).optional(),
    description: z.string().trim().max(8000).optional(),
    images: z.array(productImageSchema).max(10).optional(),
    price: z.coerce.number().min(0),
    mrp: z.coerce.number().min(0).optional().nullable(),
    taxPercent: z.coerce.number().min(0).max(100).default(0),
    stock: z.coerce.number().int().min(0).default(0),
    lowStockThreshold: z.coerce.number().int().min(0).default(5),
    unit: z.enum(PRODUCT_UNITS).default('piece'),
    packSize: z.string().trim().max(60).optional(),
    specs: z.array(productSpecSchema).max(40).optional(),
    isPublished: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    tags: z.array(z.string().trim().max(40)).max(20).optional(),
});
export const updateProductSchema = createProductSchema.partial();
export const productListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12),
    // `search` is the canonical parameter; `q` is accepted as a short alias.
    search: z.string().trim().max(120).optional(),
    q: z.string().trim().max(120).optional(),
    category: z.string().trim().max(80).optional(),
    brand: objectIdSchema.optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    unit: z.enum(PRODUCT_UNITS).optional(),
    featured: z.enum(['true', 'false']).optional(),
    inStock: z.enum(['true', 'false']).optional(),
    sort: z
        .enum(['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'popular'])
        .default('newest'),
    includeArchived: z.enum(['true', 'false']).default('false'),
});
export const productIdParamsSchema = z.object({ id: objectIdSchema });
/**
 * Resolves a category/brand reference that may be either an ObjectId or a slug
 * into the matching document id. Returns null when nothing matches.
 */
export async function resolveReference(model, reference) {
    if (!reference)
        return null;
    const value = String(reference).trim();
    if (!value)
        return null;
    const query = mongoose.isValidObjectId(value)
        ? { _id: value, isArchived: { $ne: true } }
        : { slug: value.toLowerCase(), isArchived: { $ne: true } };
    const doc = (await model.findOne(query).select('_id').lean());
    return doc?._id ? String(doc._id) : null;
}
export const stockUpdateSchema = z.object({
    stock: z.coerce.number().int().min(0, 'Stock cannot be negative'),
    lowStockThreshold: z.coerce.number().int().min(0).optional(),
    reason: z.string().trim().max(300).optional(),
});
export const publishSchema = z.object({
    isPublished: z.boolean(),
    isFeatured: z.boolean().optional(),
});
//# sourceMappingURL=product.validator.js.map