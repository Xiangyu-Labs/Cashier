import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateLedgerQueries,
  type LedgerInvalidationGroup,
} from "@/lib/mutations/ledger-invalidation";
import type { LedgerRefreshResult } from "../contract-refresh";

export function applyStreamRefreshToCache(
  queryClient: QueryClient,
  ledgerId: string,
  result: LedgerRefreshResult
): Promise<void> {
  const groups: LedgerInvalidationGroup[] = [];
  if (result.changed) groups.push("documents");
  if (result.invalidations.categories) groups.push("categories");
  if (result.invalidations.settings) groups.push("settings");
  if (result.invalidations.stats) groups.push("stats");
  return invalidateLedgerQueries(queryClient, ledgerId, groups);
}
