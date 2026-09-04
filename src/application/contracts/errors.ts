export type ApplicationErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "UPLOAD_QUOTA_EXCEEDED"
  | "STATS_RANGE_TOO_LARGE"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "PROCESSING_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL";

export interface ApplicationErrorContract {
  code: ApplicationErrorCode;
  message: string;
  correlationId?: string;
}

const CODE_BY_LEGACY_CODE: Readonly<Record<string, ApplicationErrorCode>> = {
  VALIDATION_ERROR: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  UPLOAD_QUOTA_EXCEEDED: "UPLOAD_QUOTA_EXCEEDED",
  STATS_RANGE_TOO_LARGE: "STATS_RANGE_TOO_LARGE",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  RATE_LIMIT: "RATE_LIMITED",
  LOCAL_STORAGE_UPLOAD_FAILED: "STORAGE_UNAVAILABLE",
  LOCAL_STORAGE_DOWNLOAD_FAILED: "STORAGE_UNAVAILABLE",
  S3_UPLOAD_FAILED: "STORAGE_UNAVAILABLE",
  S3_DOWNLOAD_FAILED: "STORAGE_UNAVAILABLE",
  S3_DELETE_FAILED: "STORAGE_UNAVAILABLE",
  FILE_NOT_FOUND: "NOT_FOUND",
  TASK_RUNTIME_EDGE_UNSUPPORTED: "PROCESSING_UNAVAILABLE",
  TASK_RUNTIME_NOT_INITIALIZED: "PROCESSING_UNAVAILABLE",
};

export function toApplicationError(error: unknown): ApplicationErrorContract {
  const legacyCode = error instanceof AppError ? error.code : undefined;
  const code = legacyCode == null ? "INTERNAL" : (CODE_BY_LEGACY_CODE[legacyCode] ?? "INTERNAL");
  const hidesDetails =
    code === "INTERNAL" || code === "STORAGE_UNAVAILABLE" || code === "PROCESSING_UNAVAILABLE";
  return {
    code,
    message: hidesDetails
      ? "The request could not be completed."
      : error instanceof AppError
        ? error.message
        : "The request could not be completed.",
    ...(hidesDetails ? { correlationId: crypto.randomUUID() } : {}),
  };
}
import { AppError } from "@/lib/errors";
