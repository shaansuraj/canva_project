import { z } from "zod";

export const assignableUserRoleSchema = z.enum(["presenter", "participant"]);

export const createUserSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  fullName: z.string().trim().min(2, "Full name is required."),
  designation: z.string().trim().max(80).optional().or(z.literal("")),
  role: assignableUserRoleSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a valid hex color.").optional().or(z.literal(""))
});

export const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  mustChangePassword: z.boolean().default(true)
});

export const profileStatusSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean()
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ProfileStatusInput = z.infer<typeof profileStatusSchema>;
