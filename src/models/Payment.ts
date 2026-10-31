import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';
import { PAYMENT_STATUSES, type PaymentMethod } from './Order.js';

const paymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    orderNumber: { type: String, required: true, index: true },
    method: { type: String, enum: ['razorpay', 'cod', 'bank_transfer'], default: 'razorpay' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    gateway: { type: String, default: 'razorpay' },
    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: { type: String, index: true, sparse: true },
    razorpaySignature: { type: String },
    razorpayOrderResponse: { type: Schema.Types.Mixed },
    failureReason: { type: String },
    paidAt: { type: Date },
    refund: {
      refundId: { type: String },
      amount: { type: Number, default: 0 },
      reason: { type: String },
      status: { type: String },
      initiatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date },
    },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

paymentSchema.index({ order: 1, status: 1 });

export type PaymentDocument = InferSchemaType<typeof paymentSchema> & { _id: mongoose.Types.ObjectId };

export const Payment: Model<PaymentDocument> = mongoose.model<PaymentDocument>('Payment', paymentSchema);
export default Payment;
