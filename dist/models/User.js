import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
export const USER_ROLES = ['customer', 'admin'];
const addressSchema = new Schema({
    label: { type: String, trim: true, default: 'Home' },
    fullName: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, required: true },
    line1: { type: String, trim: true, required: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true, required: true },
    state: { type: String, trim: true, required: true },
    pincode: { type: String, trim: true, required: true },
    landmark: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
    isDefault: { type: Boolean, default: false },
}, { _id: true });
const userSchema = new Schema({
    name: { type: String, trim: true, required: true, maxlength: 120 },
    email: {
        type: String,
        trim: true,
        required: true,
        unique: true,
        lowercase: true,
        index: true,
    },
    phone: { type: String, trim: true, required: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'customer', index: true },
    isActive: { type: Boolean, default: true },
    addresses: { type: [addressSchema], default: [] },
    refreshTokenHash: { type: String, select: false },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
}, { timestamps: true });
userSchema.methods.hashPassword = async function hashPassword(plain) {
    this.password = await bcrypt.hash(plain, 12);
};
userSchema.methods.verifyPassword = function verifyPassword(plain) {
    return bcrypt.compare(plain, this.password);
};
userSchema.methods.toPublicJSON = function toPublicJSON() {
    return {
        id: this._id.toString(),
        name: this.name,
        email: this.email,
        phone: this.phone,
        role: this.role,
        isActive: this.isActive,
        addresses: this.addresses,
        createdAt: this.createdAt,
    };
};
export const User = mongoose.model('User', userSchema);
export default User;
//# sourceMappingURL=User.js.map