import { z } from 'zod';
export const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(160);
export const phoneSchema = z
    .string()
    .trim()
    .regex(/^[+]?[0-9\s-]{8,16}$/, 'Enter a valid phone number');
export const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number');
export const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid identifier');
export const addressSchema = z.object({
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).optional().or(z.literal('')),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code'),
    landmark: z.string().trim().max(200).optional().or(z.literal('')),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
});
export const addressInputSchema = addressSchema.extend({
    label: z.string().trim().max(40).optional(),
    isDefault: z.boolean().optional(),
});
export default {
    emailSchema,
    phoneSchema,
    passwordSchema,
    objectIdSchema,
    addressSchema,
};
//# sourceMappingURL=common.js.map