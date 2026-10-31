import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema, addressInputSchema } from './common.js';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  // Present for API symmetry; role escalation is rejected by middleware.
  role: z.literal('customer').optional(),
  addresses: z.array(addressInputSchema).max(5).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  addresses: z.array(addressInputSchema).max(5).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
