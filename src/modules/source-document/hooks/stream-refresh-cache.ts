import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { LedgerRefreshResult } from "../contract-refresh";

export function applyStreamRefreshToCache(
  queryClient: QueryClient,
  ledgerId: string,
  result: LedgerRefreshResult
): Promise<void> {
  const shouldInvalidate =
    result.changed ||
    result.invalidations.categories ||
    result.invalidations.settings ||
    result.invalidations.stats;
  if (!shouldInvalidate) return Promise.resolve();
  return queryClient
    .invalidateQueries({ queryKey: queryKeys.ledger(ledgerId), refetchType: "active" })
    .then(() => undefined);
}
