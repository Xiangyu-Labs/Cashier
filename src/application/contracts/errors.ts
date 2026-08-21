import type { ApplicationErrorCode, ApplicationErrorContract } from ".";
import { AppError } from "@/lib/errors";

const CODE_BY_LEGACY_CODE: Readonly<Record<string, ApplicationErrorCode>> = {
  VALIDATION_ERROR: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  RATE_LIMIT: "RATE_LIMITED",
  LOCAL_STORAGE_UPLOAD_FAILED: "STORAGE_UNAVAILABLE",
  LOCAL_STORAGE_DOWNLOAD_FAILED: "STORAGE_UNAVAILABLE",
  FILE_NOT_FOUND: "NOT_FOUND",
  TASK_RUNTIME_EDGE_UNSUPPORTED: "PROCESSING_UNAVAILABLE",
  TASK_RUNTIME_NOT_INITIALIZED: "PROCESSING_UNAVAILABLE",
};

function correlationId(): string {
  return crypto.randomUUID();
}

export function toApplicationError(error: unknown): ApplicationErrorContract {
  const legacyCode = error instanceof AppError ? error.code : undefined;
  const code = legacyCode == null ? "INTERNAL" : (CODE_BY_LEGACY_CODE[legacyCode] ?? "INTERNAL");
  const message =
    code === "INTERNAL" || code === "STORAGE_UNAVAILABLE" || code === "PROCESSING_UNAVAILABLE"
      ? "The request could not be completed."
      : error instanceof AppError
        ? error.message
        : "The request could not be completed.";

  return {
    code,
    message,
    ...(code === "INTERNAL" || code === "STORAGE_UNAVAILABLE" || code === "PROCESSING_UNAVAILABLE"
      ? { correlationId: correlationId() }
      : {}),
  };
}
