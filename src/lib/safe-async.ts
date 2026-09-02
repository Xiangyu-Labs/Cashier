/**
 * Safe async utilities for fire-and-forget operations
 *
 * All promises that are intentionally not awaited should use these helpers
 * to ensure errors are logged and not silently swallowed.
 */

import { logger } from "@/lib/logger";

/**
 * Fire-and-forget helper that logs errors but doesn't throw
 *
 * Usage:
 *   fireAndForget(queryClient.invalidateQueries());
 *   fireAndForget(saveToDatabase(data), { context: "saveOrder" });
 */
export function fireAndForget<T>(
  promise: Promise<T>,
  options?: {
    context?: string;
    onError?: (error: unknown) => void;
  }
): void {
  promise.catch((error) => {
    const context = options?.context != null ? `[${options.context}] ` : "";
    logger.error(`${context}Unhandled async error:`, error);

    // Call custom error handler if provided
    options?.onError?.(error);
  });
}
