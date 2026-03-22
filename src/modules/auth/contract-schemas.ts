import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/utils/email";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  .transform((value) => value as string);

export function parseSendOTPEmail(input: unknown): string {
  const result = sendOTPEmailSchema.safeParse(input);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new ValidationError(firstIssue?.message ?? "Validation failed", {
      issues: result.error.issues,
    });
  }

  return result.data;
}
