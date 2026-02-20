/**
 * Cache version for localStorage invalidation.
 * Increment this when making breaking changes to data structure.
 */
export const CACHE_VERSION = 2;

/**
 * Check and clear cache if version mismatch.
 * Call this on app initialization.
 */
export function validateCacheVersion() {
  if (typeof window === 'undefined') return;

  const storedVersion = localStorage.getItem('cashier-cache-version');
  if (storedVersion !== String(CACHE_VERSION)) {
    localStorage.removeItem('cashier-query-cache');
    localStorage.setItem('cashier-cache-version', String(CACHE_VERSION));
  }
}
