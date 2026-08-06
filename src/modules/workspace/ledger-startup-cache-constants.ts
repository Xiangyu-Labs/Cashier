export const LEDGER_STARTUP_CACHE_DOCUMENT_LIMIT = 300;
export const LEDGER_STARTUP_CACHE_FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const CACHED_STREAM_PREVIEW_LIMIT = 20;
export const CACHED_DETAILS_PREVIEW_LIMIT = 50;

export function ledgerStartupCacheKey(userId: string, ledgerId: string) {
  return `${userId}:${ledgerId}`;
}
