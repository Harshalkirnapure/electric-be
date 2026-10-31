import mongoose from 'mongoose';
import Product from '../models/Product.js';
import InventoryAdjustment from '../models/InventoryAdjustment.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';
/**
 * Atomically decrements stock for each line using a conditional update
 * (`$inc` + `stock: { $gte: qty }` filter) so concurrent orders can never
 * oversell a product. Returns false when stock is insufficient.
 */
export async function decrementStock(lines, options) {
    for (const line of lines) {
        const result = await Product.updateOne({ _id: line.productId, stock: { $gte: line.quantity } }, { $inc: { stock: -line.quantity } });
        if (result.modifiedCount !== 1) {
            const product = await Product.findById(line.productId).select('name stock sku');
            throw AppError.conflict(`Only ${product?.stock ?? 0} unit(s) of "${product?.name ?? 'a product'}" are in stock. Please update your cart.`, 'INSUFFICIENT_STOCK', { productId: line.productId, available: product?.stock ?? 0, requested: line.quantity });
        }
        const updated = await Product.findById(line.productId).select('stock sku');
        await InventoryAdjustment.create({
            product: line.productId,
            sku: updated?.sku ?? '',
            type: 'sale',
            quantity: -line.quantity,
            previousStock: (updated?.stock ?? 0) + line.quantity,
            newStock: updated?.stock ?? 0,
            reason: options.reason,
            referenceType: options.referenceType,
            referenceId: options.referenceId ? new mongoose.Types.ObjectId(String(options.referenceId)) : undefined,
            performedBy: options.performedBy ? new mongoose.Types.ObjectId(options.performedBy) : undefined,
        });
    }
    return true;
}
/** Restores stock for cancelled/refunded orders (idempotent via the order flag). */
export async function restoreStock(lines, options) {
    for (const line of lines) {
        const result = await Product.updateOne({ _id: line.productId }, { $inc: { stock: line.quantity } });
        if (result.modifiedCount !== 1) {
            logger.warn('Could not restore stock for product', { productId: line.productId });
            continue;
        }
        const updated = await Product.findById(line.productId).select('stock sku');
        await InventoryAdjustment.create({
            product: line.productId,
            sku: updated?.sku ?? '',
            type: 'order_cancellation',
            quantity: line.quantity,
            previousStock: (updated?.stock ?? 0) - line.quantity,
            newStock: updated?.stock ?? 0,
            reason: options.reason,
            referenceType: options.referenceType,
            referenceId: options.referenceId ? new mongoose.Types.ObjectId(String(options.referenceId)) : undefined,
            performedBy: options.performedBy ? new mongoose.Types.ObjectId(options.performedBy) : undefined,
        });
    }
}
/** Verifies availability without mutating stock. */
export async function checkStockAvailability(lines) {
    for (const line of lines) {
        const product = await Product.findById(line.productId).select('name stock isPublished isArchived');
        if (!product || product.isArchived) {
            return { ok: false, productId: line.productId, name: 'A product in your cart', available: 0, requested: line.quantity };
        }
        if (product.stock < line.quantity) {
            return { ok: false, productId: line.productId, name: product.name, available: product.stock, requested: line.quantity };
        }
    }
    return { ok: true };
}
export default decrementStock;
//# sourceMappingURL=inventory.service.js.map