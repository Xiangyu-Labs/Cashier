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

/**
 * Wraps a function to make it safe for fire-and-forget usage
 *
 * Usage:
 *   const safeInvalidate = makeFireAndForget(queryClient.invalidateQueries.bind(queryClient));
 *   safeInvalidate();
 */
export function makeFireAndForget<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options?: {
    context?: string;
    onError?: (error: unknown) => void;
  }
): (...args: T) => void {
  return (...args: T) => {
    fireAndForget(fn(...args), options);
  };
}

/**
 * Use this when you truly don't care about the result (rare!)
 * Still logs at debug level for troubleshooting
 */
export function fireAndForgetSilent<T>(promise: Promise<T>): void {
  promise.catch((error) => {
    logger.debug("Silent async error (ignored):", error);
  });
}
