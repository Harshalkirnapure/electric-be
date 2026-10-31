import mongoose, { Schema } from 'mongoose';
const cartItemSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    // Snapshot of price at the time it was added — the server re-prices on checkout.
    unitPrice: { type: Number, required: true, min: 0 },
}, { _id: true });
const cartSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
}, { timestamps: true });
export const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
//# sourceMappingURL=Cart.js.map