import { AppError } from "@/lib/errors";
import type { PasswordMutationActionErrorCode } from "@/modules/auth/contracts";
import { AUTH_ERROR_CODES } from "@/modules/auth/errors";

const STABLE_PASSWORD_ERROR_CODES = new Set<string>([
  AUTH_ERROR_CODES.PASSWORD_TOO_SHORT,
  AUTH_ERROR_CODES.PASSWORD_REQUIREMENTS_NOT_MET,
  AUTH_ERROR_CODES.PASSWORD_MISMATCH,
  AUTH_ERROR_CODES.CURRENT_PASSWORD_WRONG,
]);

export function toPasswordMutationActionErrorCode(error: unknown): PasswordMutationActionErrorCode {
  if (!(error instanceof AppError)) return "unexpected";
  if (STABLE_PASSWORD_ERROR_CODES.has(error.code)) {
    return error.code as PasswordMutationActionErrorCode;
  }
  if (error.code === "VALIDATION_ERROR") return "validation_failed";
  if (error.code === "CONFLICT" || error.code === "NOT_FOUND") return "conflict";
  return "unexpected";
}
