import Product from '../models/Product.js';
import InventoryAdjustment from '../models/InventoryAdjustment.js';
import Order from '../models/Order.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { audit } from './order.controller.js';
/** GET /api/v1/admin/inventory */
export const listInventory = asyncHandler(async (req, res) => {
    const query = req.query;
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const filter = { isArchived: { $ne: true } };
    if (query.search) {
        const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safe, 'i');
        filter.$or = [{ name: regex }, { sku: regex }];
    }
    if (query.lowStock === 'true') {
        filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
    }
    if (query.outOfStock === 'true')
        filter.stock = 0;
    const sort = query.sort === 'stock_desc'
        ? { stock: -1 }
        : query.sort === 'name_asc'
            ? { name: 1 }
            : query.sort === 'newest'
                ? { createdAt: -1 }
                : { stock: 1 };
    const [items, total] = await Promise.all([
        Product.find(filter)
            .populate([{ path: 'category', select: 'name slug' }, { path: 'brand', select: 'name slug' }])
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean({ virtuals: true }),
        Product.countDocuments(filter),
    ]);
    return sendPaginated(res, items, total, page, limit, 'Inventory retrieved');
});
/** GET /api/v1/admin/inventory/alerts */
export const getLowStockAlerts = asyncHandler(async (_req, res) => {
    const lowStock = await Product.find({
        isArchived: { $ne: true },
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
    })
        .populate([{ path: 'category', select: 'name slug' }])
        .sort({ stock: 1 })
        .limit(50)
        .select('name sku stock lowStockThreshold unit images category')
        .lean();
    const outOfStock = lowStock.filter((p) => p.stock === 0);
    return sendSuccess(res, { lowStock, outOfStockCount: outOfStock.length, totalAlerts: lowStock.length }, 'Low stock alerts retrieved');
});
/** POST /api/v1/admin/inventory/adjustments */
export const createAdjustment = asyncHandler(async (req, res) => {
    const { product: productId, type, quantity, reason } = req.body;
    const product = await Product.findById(productId);
    if (!product)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    const previousStock = product.stock;
    const newStock = previousStock + quantity;
    if (newStock < 0) {
        throw AppError.badRequest(`Cannot reduce stock below zero (current stock: ${previousStock})`, 'NEGATIVE_STOCK');
    }
    product.stock = newStock;
    await product.save();
    const adjustment = await InventoryAdjustment.create({
        product: product._id,
        sku: product.sku,
        type,
        quantity,
        previousStock,
        newStock,
        reason,
        performedBy: req.user?._id,
    });
    await audit(req, 'inventory.adjustment', 'Inventory', product._id, { type, quantity, reason });
    return sendSuccess(res, adjustment, 'Stock adjusted successfully', 201);
});
/** GET /api/v1/admin/dashboard */
export const getDashboard = asyncHandler(async (req, res) => {
    const range = String(req.query.range ?? '30d');
    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };
    const days = daysMap[range] ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [totalProducts, publishedProducts, totalOrders, pendingOrders, paidRevenue, recentOrders, salesSeries, topProducts, lowStockCount] = await Promise.all([
        Product.countDocuments({ isArchived: { $ne: true } }),
        Product.countDocuments({ isArchived: { $ne: true }, isPublished: true }),
        Order.countDocuments({}),
        Order.countDocuments({ status: { $in: ['pending_payment', 'confirmed', 'processing'] } }),
        Order.aggregate([
            { $match: { 'payment.status': 'paid' } },
            { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
        ]),
        Order.find().sort({ createdAt: -1 }).limit(8).select('orderNumber customerName total status createdAt').lean(),
        Order.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    revenue: { $sum: '$total' },
                    orders: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]),
        Order.aggregate([
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    name: { $first: '$items.name' },
                    quantity: { $sum: '$items.quantity' },
                    revenue: { $sum: '$items.lineTotal' },
                },
            },
            { $sort: { quantity: -1 } },
            { $limit: 5 },
        ]),
        Product.countDocuments({
            isArchived: { $ne: true },
            $expr: { $lte: ['$stock', '$lowStockThreshold'] },
        }),
    ]);
    const revenue = paidRevenue[0]?.total ?? 0;
    const paidCount = paidRevenue[0]?.count ?? 0;
    const averageOrderValue = paidCount > 0 ? Math.round((revenue / paidCount) * 100) / 100 : 0;
    return sendSuccess(res, {
        range,
        products: { total: totalProducts, published: publishedProducts, lowStock: lowStockCount },
        orders: { total: totalOrders, pending: pendingOrders },
        revenue: { total: revenue, paidOrders: paidCount, averageOrderValue },
        salesSeries,
        topProducts,
        recentOrders,
    }, 'Dashboard data retrieved');
});
/** GET /api/v1/admin/inventory/adjustments */
export const listAdjustments = asyncHandler(async (req, res) => {
    const query = req.query;
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const filter = {};
    if (query.product)
        filter.product = query.product;
    if (query.type)
        filter.type = query.type;
    const [items, total] = await Promise.all([
        InventoryAdjustment.find(filter)
            .populate({ path: 'product', select: 'name sku images' })
            .populate({ path: 'performedBy', select: 'name email' })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        InventoryAdjustment.countDocuments(filter),
    ]);
    return sendPaginated(res, items, total, page, limit, 'Adjustments retrieved');
});
export default {
    listInventory,
    getLowStockAlerts,
    createAdjustment,
    listAdjustments,
    getDashboard,
};
//# sourceMappingURL=adminInventory.controller.js.map