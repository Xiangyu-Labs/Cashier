import { cache } from "react";

/**
 * Creates a request-scoped cache for an async function.
 * Uses React.cache() so identical calls within the same render tree
 * share the same promise result.
 */
export function createRequestCache<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return cache(fn);
}
