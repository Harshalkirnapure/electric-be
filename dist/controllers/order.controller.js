import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { generateOrderNumber } from '../utils/helpers.js';
import { calculateOrderPricing } from '../services/pricing.service.js';
import { checkDeliveryEligibility, shippingChargeFor } from '../services/delivery.service.js';
import { decrementStock, restoreStock, checkStockAvailability } from '../services/inventory.service.js';
import { canCancel, canRefund } from '../services/orderStatus.service.js';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';
export async function audit(req, action, entity, entityId, metadata) {
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
/** POST /api/v1/orders — creates an order using server-calculated prices. */
export const createOrder = asyncHandler(async (req, res) => {
    const body = req.body;
    // 1. Idempotency: the same key must never create a second order.
    if (body.idempotencyKey) {
        const existing = await Order.findOne({ idempotencyKey: body.idempotencyKey });
        if (existing)
            return sendSuccess(res, existing, 'Order already created', 200);
    }
    // 2. Merge duplicate lines of the same product.
    const quantityMap = new Map();
    for (const item of body.items) {
        quantityMap.set(item.product, (quantityMap.get(item.product) ?? 0) + item.quantity);
    }
    const requested = [...quantityMap.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    // 3. Load the real products and price them on the server.
    const productIds = requested.map((r) => r.productId);
    const products = await Product.find({
        _id: { $in: productIds },
        isPublished: true,
        isArchived: { $ne: true },
    });
    if (products.length !== productIds.length) {
        throw AppError.badRequest('One or more products in your cart are no longer available. Please review your cart.', 'PRODUCT_UNAVAILABLE');
    }
    // 4. Validate stock before touching anything.
    const availability = await checkStockAvailability(requested);
    if (!availability.ok) {
        throw AppError.conflict(`Only ${availability.available} unit(s) of "${availability.name}" are in stock.`, 'INSUFFICIENT_STOCK', availability);
    }
    // 5. Validate the delivery area — decided on the server, never by the client.
    const delivery = checkDeliveryEligibility(body.shippingAddress);
    if (!delivery.eligible) {
        throw AppError.badRequest(delivery.message, delivery.reason ?? 'DELIVERY_UNAVAILABLE', { delivery });
    }
    // 6. Price everything from server-side data.
    const quantityLookup = new Map(requested.map((r) => [r.productId, r.quantity]));
    const provisional = calculateOrderPricing(products, quantityLookup, 0);
    const { charge } = shippingChargeFor(provisional.subtotal);
    const pricing = calculateOrderPricing(products, quantityLookup, charge);
    // 6b. Cash on delivery is only allowed when enabled and within the limit.
    if (body.paymentMethod === 'cod') {
        if (!config.cod.enabled) {
            throw AppError.badRequest('Cash on delivery is not available right now. Please pay online.', 'COD_DISABLED');
        }
        if (pricing.total > config.cod.maxAmount) {
            throw AppError.badRequest(`Cash on delivery is only available for orders up to ₹${config.cod.maxAmount}. Please pay online.`, 'COD_AMOUNT_EXCEEDED', { maxAmount: config.cod.maxAmount, orderTotal: pricing.total });
        }
    }
    // 7. Create the order (status depends on the payment method).
    const status = body.paymentMethod === 'cod' ? 'confirmed' : 'pending_payment';
    const order = new Order({
        orderNumber: generateOrderNumber(),
        user: req.user._id,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        customerPhone: body.customerPhone,
        items: pricing.items.map((item) => ({
            product: item.productId,
            name: item.name,
            slug: item.slug,
            sku: item.sku,
            image: item.image,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            mrp: item.mrp,
            taxPercent: item.taxPercent,
            taxAmount: item.taxAmount,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
        })),
        shippingAddress: body.shippingAddress,
        billingAddress: body.billingAddress ?? body.shippingAddress,
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        taxAmount: pricing.taxAmount,
        shippingCharge: pricing.shippingCharge,
        total: pricing.total,
        status,
        notes: body.notes,
        idempotencyKey: body.idempotencyKey,
        payment: {
            method: body.paymentMethod,
            status: 'pending',
            amount: pricing.total,
            currency: 'INR',
        },
        shipping: {
            provider: 'local_delivery',
            status: 'not_shipped',
            distanceKm: delivery.distanceKm ?? undefined,
            charge: pricing.shippingCharge,
            etaDays: delivery.etaDays,
        },
        timeline: [{ status, note: 'Order placed', by: req.user?._id }],
    });
    await order.save();
    // 8. Reserve stock atomically.
    try {
        await decrementStock(requested, {
            reason: `Order ${order.orderNumber} placed`,
            referenceType: 'order',
            referenceId: String(order._id),
            performedBy: String(req.user._id),
        });
    }
    catch (err) {
        // Roll back the order so no orphan pending order remains.
        await Order.deleteOne({ _id: order._id });
        throw err;
    }
    // 9. Clear the server-side cart for this user.
    await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } });
    await audit(req, 'order.create', 'Order', order._id, {
        orderNumber: order.orderNumber,
        total: order.total,
    });
    logger.info('Order created', {
        orderNumber: order.orderNumber,
        userId: String(req.user._id),
        total: order.total,
    });
    return sendSuccess(res, order, 'Order placed successfully', 201);
});
/** POST /api/v1/orders/:id/cancel */
export const cancelOrder = asyncHandler(async (req, res) => {
    const { reason, restoreStock: shouldRestoreStock } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order)
        throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    const isOwner = String(order.user) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') {
        throw AppError.forbidden('You cannot cancel this order', 'ORDER_ACCESS_DENIED');
    }
    if (!canCancel(order.status)) {
        throw AppError.badRequest(`An order in "${order.status}" status can no longer be cancelled`, 'ORDER_NOT_CANCELLABLE');
    }
    if (order.payment.status === 'paid' && req.user.role !== 'admin') {
        throw AppError.badRequest('This order has been paid. Please contact the store to arrange a refund.', 'PAID_ORDER_CONTACT_US');
    }
    order.status = 'cancelled';
    order.cancelledReason = reason;
    order.cancelledAt = new Date();
    order.timeline.push({ status: 'cancelled', note: reason, by: req.user?._id });
    await order.save();
    if (shouldRestoreStock && !order.stockRestored) {
        await restoreStock(order.items.map((i) => ({ productId: String(i.product), quantity: i.quantity })), {
            reason: `Order ${order.orderNumber} cancelled`,
            referenceType: 'order',
            referenceId: String(order._id),
            performedBy: String(req.user._id),
        });
        order.stockRestored = true;
        await order.save();
    }
    await audit(req, 'order.cancel', 'Order', order._id, { reason, restoreStock: shouldRestoreStock });
    return sendSuccess(res, order, 'Order cancelled successfully');
});
/** POST /api/v1/orders/:id/refund (admin only) */
export const refundOrder = asyncHandler(async (req, res) => {
    const { amount, reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order)
        throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    if (!canRefund(order.status)) {
        throw AppError.badRequest(`An order in "${order.status}" status cannot be refunded`, 'ORDER_NOT_REFUNDABLE');
    }
    if (order.payment.status !== 'paid' && order.payment.status !== 'partially_refunded') {
        throw AppError.badRequest('Only paid orders can be refunded', 'ORDER_NOT_PAID');
    }
    const alreadyRefunded = order.payment.refundedAmount ?? 0;
    const maxRefundable = order.total - alreadyRefunded;
    const refundAmount = amount ?? maxRefundable;
    if (refundAmount <= 0 || refundAmount > maxRefundable) {
        throw AppError.badRequest(`Refund amount must be between 1 and ₹${maxRefundable}`, 'INVALID_REFUND_AMOUNT');
    }
    order.status = 'refund_pending';
    order.timeline.push({ status: 'refund_pending', note: `Refund requested: ${reason}`, by: req.user?._id });
    await order.save();
    await audit(req, 'order.refund_requested', 'Order', order._id, { amount: refundAmount, reason });
    return sendSuccess(res, { order, refundAmount, status: 'refund_pending' }, 'Refund initiated. It will be completed after gateway confirmation.');
});
/** GET /api/v1/orders/my-orders */
export const getMyOrders = asyncHandler(async (req, res) => {
    const query = req.query;
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const filter = { user: req.user._id };
    if (query.status)
        filter.status = query.status;
    const [items, total] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Order.countDocuments(filter),
    ]);
    return sendPaginated(res, items, total, page, limit, 'Orders retrieved');
});
/** GET /api/v1/orders/:id */
export const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).lean();
    if (!order)
        throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    const isOwner = String(order.user) === String(req.user._id);
    if (!isOwner && req.user.role !== 'admin') {
        throw AppError.forbidden('You cannot view this order', 'ORDER_ACCESS_DENIED');
    }
    return sendSuccess(res, order, 'Order retrieved');
});
//# sourceMappingURL=order.controller.js.map