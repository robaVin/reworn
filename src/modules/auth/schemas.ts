import { z } from 'zod';

/**
 * Input validation for auth endpoints.
 *
 * Email is normalised (trimmed + lower-cased) so the same account cannot be
 * addressed under casing variants. Passwords are validated for length only —
 * Supabase owns hashing and strength policy; we never see or store them.
 */

const normalizedEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('A valid email address is required.')
  .max(320);

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(200);

export const registerSchema = z.object({
  email: normalizedEmail,
  password,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1).max(200), // don't reveal length policy on login
  // Optional post-login destination; validated as a safe internal path later.
  redirectTo: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;
