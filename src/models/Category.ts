import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 120, unique: true },
    slug: { type: String, trim: true, required: true, unique: true, lowercase: true, index: true },
    description: { type: String, trim: true },
    image: { type: String },
    icon: { type: String, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

categorySchema.index({ isActive: 1, isArchived: 1, displayOrder: 1 });

export type CategoryDocument = InferSchemaType<typeof categorySchema> & { _id: mongoose.Types.ObjectId };

export const Category: Model<CategoryDocument> = mongoose.model<CategoryDocument>('Category', categorySchema);
export default Category;
