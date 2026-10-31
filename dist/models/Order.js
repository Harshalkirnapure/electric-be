import mongoose, { Schema } from 'mongoose';
export const ORDER_STATUSES = [
    'pending_payment',
    'confirmed',
    'processing',
    'shipped',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'refund_pending',
    'refunded',
];
export const PAYMENT_STATUSES = [
    'pending',
    'authorized',
    'paid',
    'failed',
    'refunded',
    'partially_refunded',
];
export const PAYMENT_METHODS = ['razorpay', 'cod', 'bank_transfer'];
export const SHIPMENT_STATUSES = [
    'not_shipped',
    'packed',
    'shipped',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'returned',
];
/** Immutable snapshot of a purchased product line. */
const orderItemSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    sku: { type: String, required: true },
    image: { type: String },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
}, { _id: true });
const addressSnapshotSchema = new Schema({
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    landmark: { type: String },
    lat: { type: Number },
    lng: { type: Number },
}, { _id: false });
const paymentInfoSchema = new Schema({
    method: { type: String, enum: PAYMENT_METHODS, default: 'razorpay' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    paidAt: { type: Date },
    refundedAmount: { type: Number, default: 0 },
    refundId: { type: String },
    refundReason: { type: String },
    refundedAt: { type: Date },
    failureReason: { type: String },
}, { _id: false });
const shippingInfoSchema = new Schema({
    provider: { type: String, default: 'local_delivery' },
    courierName: { type: String },
    trackingNumber: { type: String },
    status: { type: String, enum: SHIPMENT_STATUSES, default: 'not_shipped' },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    notes: { type: String },
    // Delivery eligibility snapshot at checkout time
    distanceKm: { type: Number },
    charge: { type: Number, default: 0 },
    etaDays: { type: Number },
}, { _id: false });
const timelineSchema = new Schema({
    status: { type: String, required: true },
    note: { type: String },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });
const orderSchema = new Schema({
    orderNumber: { type: String, required: true, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    shippingAddress: { type: addressSnapshotSchema, required: true },
    billingAddress: { type: addressSnapshotSchema },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    shippingCharge: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment', index: true },
    payment: { type: paymentInfoSchema, default: () => ({}) },
    shipping: { type: shippingInfoSchema, default: () => ({}) },
    notes: { type: String },
    adminNotes: { type: String },
    timeline: { type: [timelineSchema], default: [] },
    cancelledReason: { type: String },
    cancelledAt: { type: Date },
    stockRestored: { type: Boolean, default: false },
    // Idempotency key provided by the client when creating the order
    idempotencyKey: { type: String, index: true, sparse: true },
}, { timestamps: true });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'payment.razorpayOrderId': 1 }, { sparse: true });
export const Order = mongoose.model('Order', orderSchema);
export default Order;
//# sourceMappingURL=Order.js.map