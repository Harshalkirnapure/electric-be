import Order, { ORDER_STATUSES } from '../models/Order.js';
import Payment from '../models/Payment.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { assertTransition } from '../services/orderStatus.service.js';
import { audit } from './order.controller.js';
function buildFilter(query) {
    const filter = {};
    if (query.status)
        filter.status = query.status;
    if (query.paymentStatus)
        filter['payment.status'] = query.paymentStatus;
    if (query.method)
        filter['payment.method'] = query.method;
    if (query.search) {
        const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safe, 'i');
        filter.$or = [{ orderNumber: regex }, { customerName: regex }, { customerEmail: regex }, { customerPhone: regex }];
    }
    if (query.from || query.to) {
        const range = {};
        if (query.from)
            range.$gte = new Date(String(query.from));
        if (query.to)
            range.$lte = new Date(String(query.to));
        filter.createdAt = range;
    }
    return filter;
}
function sortFor(sort) {
    switch (sort) {
        case 'oldest':
            return { createdAt: 1 };
        case 'amount_desc':
            return { total: -1 };
        case 'amount_asc':
            return { total: 1 };
        default:
            return { createdAt: -1 };
    }
}
/** GET /api/v1/admin/orders */
export const listOrders = asyncHandler(async (req, res) => {
    const query = req.query;
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const filter = buildFilter(query);
    const [items, total] = await Promise.all([
        Order.find(filter)
            .sort(sortFor(String(query.sort ?? 'newest')))
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Order.countDocuments(filter),
    ]);
    return sendPaginated(res, items, total, page, limit, 'Orders retrieved');
});
/** GET /api/v1/admin/orders/stats */
export const getOrderStats = asyncHandler(async (_req, res) => {
    const [byStatus, totals, recent] = await Promise.all([
        Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$total' } } }]),
        Order.aggregate([
            {
                $group: {
                    _id: null,
                    revenue: { $sum: '$total' },
                    orders: { $sum: 1 },
                    paid: { $sum: { $cond: [{ $eq: ['$payment.status', 'paid'] }, 1, 0] } },
                    pending: { $sum: { $cond: [{ $eq: ['$status', 'pending_payment'] }, 1, 0] } },
                },
            },
        ]),
        Order.find().sort({ createdAt: -1 }).limit(5).select('orderNumber customerName total status createdAt').lean(),
    ]);
    const statusMap = {};
    for (const s of byStatus)
        statusMap[s._id] = { count: s.count, amount: s.amount };
    return sendSuccess(res, {
        byStatus: statusMap,
        totals: totals[0] ?? { revenue: 0, orders: 0, paid: 0, pending: 0 },
        recentOrders: recent,
        statusOptions: ORDER_STATUSES,
    }, 'Order statistics retrieved');
});
/** GET /api/v1/admin/orders/:id */
export const getOrder = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).lean();
    if (!order)
        throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    return sendSuccess(res, order, 'Order retrieved');
});
/** PATCH /api/v1/admin/orders/:id/status */
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order)
        throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    assertTransition(order.status, status);
    order.status = status;
    order.timeline.push({ status, note: note || `Status changed to ${status}`, by: req.user?._id });
    await order.save();
    await audit(req, 'order.status_change', 'Order', order._id, { status, note });
    return sendSuccess(res, order, `Order status updated to ${status}`);
});
/** PATCH /api/v1/admin/orders/:id/shipping */
export const updateShipping = asyncHandler(async (req, res) => {
    const { courierName, trackingNumber, provider, status, notes, etaDays } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order)
        throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    order.shipping = {
        ...order.shipping,
        courierName: courierName ?? order.shipping?.courierName,
        trackingNumber: trackingNumber ?? order.shipping?.trackingNumber,
        provider: provider ?? order.shipping?.provider ?? 'local_delivery',
        status: status ?? order.shipping?.status ?? 'not_shipped',
        notes: notes ?? order.shipping?.notes,
        etaDays: etaDays ?? order.shipping?.etaDays,
        shippedAt: status === 'shipped' ? new Date() : order.shipping?.shippedAt,
        deliveredAt: status === 'delivered' ? new Date() : order.shipping?.deliveredAt,
    };
    await order.save();
    await audit(req, 'order.shipping_update', 'Order', order._id, { status, trackingNumber });
    return sendSuccess(res, order, 'Shipping details updated');
});
/** POST /api/v1/admin/orders/:id/notes */
export const addAdminNote = asyncHandler(async (req, res) => {
    const { note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order)
        throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    order.adminNotes = note;
    await order.save();
    await audit(req, 'order.note', 'Order', order._id, { note });
    return sendSuccess(res, order, 'Note saved');
});
/** GET /api/v1/admin/payments */
export const listPayments = asyncHandler(async (req, res) => {
    const query = req.query;
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const filter = {};
    if (query.status)
        filter.status = query.status;
    if (query.method)
        filter.method = query.method;
    const [items, total] = await Promise.all([
        Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Payment.countDocuments(filter),
    ]);
    return sendPaginated(res, items, total, page, limit, 'Payments retrieved');
});
export default {
    listOrders,
    getOrderStats,
    getOrder,
    updateOrderStatus,
    updateShipping,
    addAdminNote,
    listPayments,
};
//# sourceMappingURL=adminOrder.controller.js.map