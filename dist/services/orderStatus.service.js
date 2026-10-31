import AppError from '../utils/AppError.js';
/**
 * Allowed order status transitions.
 * Terminal states (delivered, cancelled, refunded) require an explicit
 * admin override for refunds, which is handled by the refund workflow.
 */
export const STATUS_TRANSITIONS = {
    pending_payment: ['confirmed', 'cancelled'],
    confirmed: ['processing', 'cancelled', 'refund_pending'],
    processing: ['shipped', 'cancelled', 'refund_pending'],
    shipped: ['out_for_delivery', 'delivered', 'refund_pending'],
    out_for_delivery: ['delivered', 'refund_pending'],
    delivered: ['refund_pending'],
    cancelled: ['refund_pending'],
    refund_pending: ['refunded', 'confirmed'],
    refunded: [],
};
export function canTransition(from, to) {
    if (from === to)
        return false;
    return (STATUS_TRANSITIONS[from] ?? []).includes(to);
}
export function assertTransition(from, to) {
    if (!canTransition(from, to)) {
        throw AppError.badRequest(`Cannot change order status from "${from}" to "${to}"`, 'INVALID_STATUS_TRANSITION', { from, to, allowed: STATUS_TRANSITIONS[from] ?? [] });
    }
}
/** Statuses in which stock is considered consumed (i.e. not restorable). */
export function isStockCommitted(status) {
    return ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'].includes(status);
}
export function canCancel(status) {
    return ['pending_payment', 'confirmed', 'processing'].includes(status);
}
export function canRefund(status) {
    return ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'].includes(status);
}
export default assertTransition;
//# sourceMappingURL=orderStatus.service.js.map