import Product from '../models/Product.js';
import Category from '../models/Category.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { slugify } from '../utils/helpers.js';
export const POPULATE = [
    { path: 'category', select: 'name slug icon image' },
    { path: 'brand', select: 'name slug logo' },
];
export async function ensureUniqueSlug(name, excludeId) {
    const base = slugify(name) || 'product';
    let slug = base;
    let counter = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const query = { slug };
        if (excludeId)
            query._id = { $ne: excludeId };
        const exists = await Product.exists(query);
        if (!exists)
            return slug;
        slug = `${base}-${++counter}`;
        if (counter > 50)
            return `${base}-${Date.now().toString(36)}`;
    }
}
export async function buildProductFilter(query, includeArchived) {
    const filter = {};
    if (!includeArchived) {
        filter.isPublished = true;
        filter.isArchived = { $ne: true };
    }
    else {
        filter.isArchived = { $ne: true };
    }
    if (query.category) {
        const category = await Category.findOne({
            $or: [
                { slug: String(query.category).toLowerCase() },
                { name: new RegExp(`^${String(query.category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            ],
        }).select('_id');
        if (!category)
            return { ...filter, _id: null };
        filter.category = category._id;
    }
    if (query.brand)
        filter.brand = query.brand;
    if (query.unit)
        filter.unit = query.unit;
    if (query.featured === 'true')
        filter.isFeatured = true;
    if (query.minRating)
        filter.rating = { $gte: Number(query.minRating) };
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        const priceRange = {};
        if (query.minPrice !== undefined)
            priceRange.$gte = Number(query.minPrice);
        if (query.maxPrice !== undefined)
            priceRange.$lte = Number(query.maxPrice);
        filter.price = priceRange;
    }
    if (query.inStock === 'true')
        filter.stock = { $gt: 0 };
    if (query.search) {
        const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safe, 'i');
        filter.$or = [{ name: regex }, { sku: regex }, { shortDescription: regex }, { tags: regex }];
    }
    return filter;
}
export function sortFor(sort) {
    switch (sort) {
        case 'price_asc':
            return { price: 1 };
        case 'price_desc':
            return { price: -1 };
        case 'name_asc':
            return { name: 1 };
        case 'name_desc':
            return { name: -1 };
        case 'popular':
            return { soldCount: -1, rating: -1 };
        case 'oldest':
            return { createdAt: 1 };
        default:
            return { createdAt: -1 };
    }
}
/** GET /api/v1/products */
export const listProducts = asyncHandler(async (req, res) => {
    const query = req.query;
    const includeArchived = query.includeArchived === 'true';
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 12);
    const filter = await buildProductFilter(query, includeArchived);
    const [items, total] = await Promise.all([
        Product.find(filter)
            .populate(POPULATE)
            .sort(sortFor(String(query.sort ?? 'newest')))
            .skip((page - 1) * limit)
            .limit(limit)
            .lean({ virtuals: true }),
        Product.countDocuments(filter),
    ]);
    return sendPaginated(res, items, total, page, limit, 'Products retrieved');
});
/** GET /api/v1/products/featured */
export const getFeaturedProducts = asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 8), 24);
    const items = await Product.find({
        isPublished: true,
        isArchived: { $ne: true },
        isFeatured: true,
        stock: { $gt: 0 },
    })
        .populate(POPULATE)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean({ virtuals: true });
    return sendSuccess(res, items, 'Featured products retrieved');
});
/** GET /api/v1/products/best-sellers */
export const getBestSellers = asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 8), 24);
    const items = await Product.find({ isPublished: true, isArchived: { $ne: true } })
        .populate(POPULATE)
        .sort({ soldCount: -1, rating: -1 })
        .limit(limit)
        .lean({ virtuals: true });
    return sendSuccess(res, items, 'Best selling products retrieved');
});
/** GET /api/v1/products/latest */
export const getLatestProducts = asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 8), 24);
    const items = await Product.find({ isPublished: true, isArchived: { $ne: true } })
        .populate(POPULATE)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean({ virtuals: true });
    return sendSuccess(res, items, 'Latest products retrieved');
});
/** GET /api/v1/products/categories */
export const getProductCategories = asyncHandler(async (_req, res) => {
    const categories = await Category.find({ isActive: true, isArchived: { $ne: true } })
        .populate({ path: 'parent', select: 'name slug' })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
    const counts = await Product.aggregate([
        { $match: { isPublished: true, isArchived: { $ne: true } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    const enriched = categories.map((c) => ({
        ...c,
        productCount: countMap.get(String(c._id)) ?? 0,
    }));
    return sendSuccess(res, enriched, 'Categories retrieved');
});
/** GET /api/v1/products/search */
export const searchProducts = asyncHandler(async (req, res) => {
    const query = req.query;
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 12);
    const term = String(query.q ?? query.search ?? '').trim();
    if (!term)
        throw AppError.badRequest('Enter something to search for', 'EMPTY_SEARCH');
    const filter = await buildProductFilter({ ...query, search: term }, query.includeArchived === 'true');
    const [items, total] = await Promise.all([
        Product.find(filter)
            .populate(POPULATE)
            .sort(sortFor(String(query.sort ?? 'newest')))
            .skip((page - 1) * limit)
            .limit(limit)
            .lean({ virtuals: true }),
        Product.countDocuments(filter),
    ]);
    return sendPaginated(res, items, total, page, limit, 'Search results');
});
/** GET /api/v1/products/:slug */
export const getProductBySlug = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const product = await Product.findOne({ slug: slug.toLowerCase(), isArchived: { $ne: true } })
        .populate(POPULATE)
        .lean({ virtuals: true });
    if (!product)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    if (!product.isPublished && req.user?.role !== 'admin') {
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    }
    const related = await Product.find({
        _id: { $ne: product._id },
        category: product.category?._id ?? product.category,
        isPublished: true,
        isArchived: { $ne: true },
    })
        .populate(POPULATE)
        .limit(6)
        .lean({ virtuals: true });
    return sendSuccess(res, { product, related }, 'Product retrieved');
});
export default {
    listProducts,
    getFeaturedProducts,
    getBestSellers,
    getLatestProducts,
    getProductCategories,
    searchProducts,
    getProductBySlug,
};
//# sourceMappingURL=product.controller.js.map