import mongoose, { Schema } from 'mongoose';
/**
 * Idempotency ledger for inbound gateway webhooks.
 * A unique index on `eventId` guarantees an event is processed exactly once.
 */
const webhookEventSchema = new Schema({
    eventId: { type: String, required: true, unique: true, index: true },
    provider: { type: String, default: 'razorpay' },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['received', 'processed', 'failed', 'ignored'], default: 'received' },
    error: { type: String },
    processedAt: { type: Date },
}, { timestamps: true });
webhookEventSchema.index({ eventType: 1, createdAt: -1 });
export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
export default WebhookEvent;
//# sourceMappingURL=WebhookEvent.js.map