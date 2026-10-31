import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import InventoryAdjustment from '../models/InventoryAdjustment.js';
import Order from '../models/Order.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { ensureUniqueSlug, buildProductFilter, sortFor, POPULATE } from './product.controller.js';
import { resolveReference } from '../validators/product.validator.js';
import logger from '../utils/logger.js';
async function audit(req, action, entity, entityId, metadata) {
    await AuditLog.create({
        action,
        entity,
        entityId: entityId ? new mongoose.Types.ObjectId(String(entityId)) : undefined,
        actor: req.user?._id,
        actorEmail: req.user?.email,
        metadata,
        ip: req.ip,
        requestId: req.id,
    });
}
/** GET /api/v1/admin/products */
export const listAdminProducts = asyncHandler(async (req, res) => {
    const query = req.query;
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    // Admin sees everything except hard-archived products (toggleable).
    const filter = await buildProductFilter(query, true);
    delete filter.isPublished;
    if (query.isPublished === 'true')
        filter.isPublished = true;
    if (query.isPublished === 'false')
        filter.isPublished = false;
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
/** GET /api/v1/admin/products/:id */
export const getAdminProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).populate(POPULATE).lean({ virtuals: true });
    if (!product)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    return sendSuccess(res, product, 'Product retrieved');
});
/** POST /api/v1/admin/products */
export const createProduct = asyncHandler(async (req, res) => {
    const body = { ...req.body };
    // The client may reference a category/brand by ObjectId **or** by slug.
    const categoryId = await resolveReference(Category, body.category);
    if (!categoryId)
        throw AppError.badRequest('Select a valid category', 'INVALID_CATEGORY');
    body.category = categoryId;
    if (body.brand) {
        const brandId = await resolveReference(Brand, body.brand);
        if (!brandId)
            throw AppError.badRequest('Select a valid brand', 'INVALID_BRAND');
        body.brand = brandId;
    }
    else {
        delete body.brand;
    }
    const sku = String(body.sku).trim().toUpperCase();
    if (await Product.exists({ sku })) {
        throw AppError.conflict(`SKU "${sku}" is already in use`, 'DUPLICATE_SKU');
    }
    const product = new Product({
        ...body,
        sku,
        slug: await ensureUniqueSlug(String(body.name)),
    });
    await product.save();
    await audit(req, 'product.create', 'Product', product._id, { name: product.name, sku });
    const populated = await Product.findById(product._id).populate(POPULATE);
    return sendSuccess(res, populated, 'Product created successfully', 201);
});
/** PATCH /api/v1/admin/products/:id */
export const updateProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    const body = { ...req.body };
    if (body.category) {
        const categoryId = await resolveReference(Category, body.category);
        if (!categoryId)
            throw AppError.badRequest('Select a valid category', 'INVALID_CATEGORY');
        body.category = categoryId;
    }
    if (body.brand) {
        const brandId = await resolveReference(Brand, body.brand);
        if (!brandId)
            throw AppError.badRequest('Select a valid brand', 'INVALID_BRAND');
        body.brand = brandId;
    }
    else {
        delete body.brand;
    }
    if (body.sku) {
        const sku = String(body.sku).trim().toUpperCase();
        if (sku !== product.sku && (await Product.exists({ sku, _id: { $ne: product._id } }))) {
            throw AppError.conflict(`SKU "${sku}" is already in use`, 'DUPLICATE_SKU');
        }
        body.sku = sku;
    }
    if (body.name && body.name !== product.name) {
        body.slug = await ensureUniqueSlug(String(body.name), String(product._id));
    }
    const previousPrice = product.price;
    Object.assign(product, body);
    await product.save();
    if (body.price !== undefined && body.price !== previousPrice) {
        await InventoryAdjustment.create({
            product: product._id,
            sku: product.sku,
            type: 'correction',
            quantity: 0,
            previousStock: product.stock,
            newStock: product.stock,
            reason: `Price updated from ₹${previousPrice} to ₹${product.price}`,
            performedBy: req.user?._id,
        });
    }
    await audit(req, 'product.update', 'Product', product._id, {
        changed: Object.keys(body),
        previousPrice,
        newPrice: product.price,
    });
    const populated = await Product.findById(product._id).populate(POPULATE);
    return sendSuccess(res, populated, 'Product updated successfully');
});
/** PATCH /api/v1/admin/products/:id/publish */
export const togglePublish = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    const { isPublished, isFeatured } = req.body;
    product.isPublished = isPublished;
    if (typeof isFeatured === 'boolean')
        product.isFeatured = isFeatured;
    await product.save();
    await audit(req, 'product.publish', 'Product', product._id, { isPublished: product.isPublished });
    return sendSuccess(res, product, product.isPublished ? 'Product published successfully' : 'Product unpublished successfully');
});
/** PATCH /api/v1/admin/products/:id/stock */
export const updateStock = asyncHandler(async (req, res) => {
    const { stock, lowStockThreshold, reason } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    const previousStock = product.stock;
    product.stock = stock;
    if (typeof lowStockThreshold === 'number')
        product.lowStockThreshold = lowStockThreshold;
    await product.save();
    await InventoryAdjustment.create({
        product: product._id,
        sku: product.sku,
        type: stock > previousStock ? 'restock' : 'correction',
        quantity: stock - previousStock,
        previousStock,
        newStock: stock,
        reason: reason || 'Manual stock update by admin',
        performedBy: req.user?._id,
    });
    await audit(req, 'product.stock', 'Product', product._id, { previousStock, newStock: stock });
    return sendSuccess(res, product, 'Stock updated successfully');
});
/**
 * DELETE /api/v1/admin/products/:id
 * Products referenced by historical orders are archived (soft-deleted) instead
 * of being removed, so past invoices keep their meaning.
 */
export const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    const referenced = await Order.countDocuments({ 'items.product': product._id });
    if (referenced > 0) {
        product.isArchived = true;
        product.isPublished = false;
        await product.save();
        await audit(req, 'product.archive', 'Product', product._id, { referencedOrders: referenced });
        return sendSuccess(res, { archived: true, referencedOrders: referenced }, 'Product has order history, so it was archived instead of deleted');
    }
    await product.deleteOne();
    await audit(req, 'product.delete', 'Product', product._id, { name: product.name });
    logger.info('Product deleted', { productId: String(product._id) });
    return sendSuccess(res, null, 'Product deleted successfully');
});
export default {
    listAdminProducts,
    getAdminProduct,
    createProduct,
    updateProduct,
    togglePublish,
    updateStock,
    deleteProduct,
};
//# sourceMappingURL=adminProduct.controller.js.map