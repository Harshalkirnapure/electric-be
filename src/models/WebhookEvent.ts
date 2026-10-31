import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

/**
 * Idempotency ledger for inbound gateway webhooks.
 * A unique index on `eventId` guarantees an event is processed exactly once.
 */
const webhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    provider: { type: String, default: 'razorpay' },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['received', 'processed', 'failed', 'ignored'], default: 'received' },
    error: { type: String },
    processedAt: { type: Date },
  },
  { timestamps: true },
);

webhookEventSchema.index({ eventType: 1, createdAt: -1 });

export type WebhookEventDocument = InferSchemaType<typeof webhookEventSchema> & { _id: mongoose.Types.ObjectId };

export const WebhookEvent: Model<WebhookEventDocument> = mongoose.model<WebhookEventDocument>(
  'WebhookEvent',
  webhookEventSchema,
);
export default WebhookEvent;
