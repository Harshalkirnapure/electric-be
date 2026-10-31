import mongoose, { Schema } from 'mongoose';
export const ADJUSTMENT_TYPES = [
    'restock',
    'correction',
    'damage',
    'return_supplier',
    'manual_decrement',
    'order_cancellation',
    'sale',
];
const inventoryAdjustmentSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    sku: { type: String, required: true },
    type: { type: String, enum: ADJUSTMENT_TYPES, required: true },
    quantity: { type: Number, required: true }, // positive = stock in, negative = stock out
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    reason: { type: String, required: true },
    referenceType: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
}, { timestamps: true });
inventoryAdjustmentSchema.index({ product: 1, createdAt: -1 });
export const InventoryAdjustment = mongoose.model('InventoryAdjustment', inventoryAdjustmentSchema);
export default InventoryAdjustment;
//# sourceMappingURL=InventoryAdjustment.js.map