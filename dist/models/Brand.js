import mongoose, { Schema } from 'mongoose';
const brandSchema = new Schema({
    name: { type: String, trim: true, required: true, maxlength: 120, unique: true },
    slug: { type: String, trim: true, required: true, unique: true, lowercase: true, index: true },
    logo: { type: String },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
}, { timestamps: true });
export const Brand = mongoose.model('Brand', brandSchema);
export default Brand;
//# sourceMappingURL=Brand.js.map