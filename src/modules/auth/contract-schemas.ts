import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/utils/email";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
declare const sendOTPEmailBrand: unique symbol;

export type SendOTPEmail = string & { readonly [sendOTPEmailBrand]: true };

const sendOTPEmailSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (typeof value !== "string" || value === "" || value.length > MAX_EMAIL_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid email address",
      });
      return;
    }

    if (!EMAIL_REGEX.test(normalizeEmail(value))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid email format",
      });
    }
  })
  .transform((value) => value as SendOTPEmail);

export function parseSendOTPEmail(input: unknown): SendOTPEmail {
  const result = sendOTPEmailSchema.safeParse(input);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new ValidationError(firstIssue?.message ?? "Validation failed", {
      issues: result.error.issues,
    });
  }

  return result.data;
}

const passwordMutationSchema = z
  .object({
    currentPassword: z.string().max(128).optional(),
    newPassword: z.string().max(128),
    confirmPassword: z.string().max(128),
  })
  .strict();

export type PasswordMutationInput = z.infer<typeof passwordMutationSchema>;

export function parsePasswordMutationInput(input: unknown): PasswordMutationInput {
  const result = passwordMutationSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Invalid password input", { issues: result.error.issues });
  }
  return result.data;
}
