import mongoose, { Schema } from 'mongoose';
export const PRODUCT_UNITS = ['piece', 'metre', 'm', 'roll', 'box', 'pack', 'set', 'kg', 'litre'];
const imageSchema = new Schema({
    url: { type: String, required: true },
    publicId: { type: String },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
}, { _id: false });
const specSchema = new Schema({
    key: { type: String, trim: true, required: true },
    value: { type: String, trim: true, required: true },
}, { _id: false });
const productSchema = new Schema({
    name: { type: String, trim: true, required: true, maxlength: 200 },
    slug: { type: String, trim: true, required: true, unique: true, lowercase: true, index: true },
    sku: { type: String, trim: true, required: true, unique: true, uppercase: true, index: true },
    shortDescription: { type: String, trim: true, maxlength: 500 },
    description: { type: String, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', index: true },
    images: { type: [imageSchema], default: [] },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    stock: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    unit: { type: String, enum: PRODUCT_UNITS, default: 'piece' },
    packSize: { type: String, trim: true },
    specs: { type: [specSchema], default: [] },
    isPublished: { type: Boolean, default: false, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    isArchived: { type: Boolean, default: false, index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    tags: { type: [String], default: [], index: true },
    searchText: { type: String, default: '', index: 'text' },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });
productSchema.index({ name: 'text', description: 'text', shortDescription: 'text', sku: 'text', tags: 'text' });
productSchema.index({ isPublished: 1, isArchived: 1, createdAt: -1 });
productSchema.index({ category: 1, isPublished: 1, price: 1 });
productSchema.virtual('discountPercent').get(function discountPercent() {
    if (!this.mrp || this.mrp <= this.price)
        return 0;
    return Math.round(((this.mrp - this.price) / this.mrp) * 100);
});
productSchema.virtual('inStock').get(function inStock() {
    return this.stock > 0;
});
productSchema.virtual('isLowStock').get(function isLowStock() {
    return this.stock > 0 && this.stock <= this.lowStockThreshold;
});
productSchema.pre('save', function updateSearchText(next) {
    this.searchText = [this.name, this.shortDescription, this.description, this.sku, ...(this.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    next();
});
export const Product = mongoose.model('Product', productSchema);
export default Product;
//# sourceMappingURL=Product.js.map