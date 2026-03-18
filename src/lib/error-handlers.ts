import { logger } from "./logger";
import { AppError } from "./errors";

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Convert any error to standard error response
 */
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    };
  }

  if (error instanceof Error) {
    return {
      error: {
        message: error.message,
        code: "INTERNAL_ERROR",
      },
    };
  }

  return {
    error: {
      message: "An unknown error occurred",
      code: "UNKNOWN_ERROR",
    },
  };
}

/**
 * Get HTTP status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  return 500;
}

/**
 * Log error with appropriate level
 */
export function logError(context: string, error: unknown): void {
  if (error instanceof AppError && error.statusCode < 500) {
    logger.warn({ error, context }, "Client error occurred");
  } else {
    logger.error({ error, context }, "Server error occurred");
  }
}
