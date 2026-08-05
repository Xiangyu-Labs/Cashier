import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateLedgerSettings,
  invalidateLedgerStats,
  invalidateSourceDocumentStream,
  invalidateSourceDocumentStreamTotal,
  queryKeys,
} from "@/lib/query-keys";
import type { LedgerDeltaResult } from "../contract-refresh";
import {
  applyOptimisticDelete,
  applyServerRefreshUpsert,
} from "./source-document-optimistic-cache";

const VERSION_PREFIX = "cashier-ledger-sync-v2:";

export function readLedgerSyncVersion(ledgerId: string): string {
  if (typeof localStorage === "undefined") return "0";
  return localStorage.getItem(`${VERSION_PREFIX}${ledgerId}`) ?? "0";
}

export function writeLedgerSyncVersion(ledgerId: string, version: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(`${VERSION_PREFIX}${ledgerId}`, version);
  }
}

export function applyStreamRefreshToCache(
  queryClient: QueryClient,
  ledgerId: string,
  result: LedgerDeltaResult
): void {
  if (result.resetRequired) {
    writeLedgerSyncVersion(ledgerId, result.toVersion);
    // Keep the current list visible and calibrate in the background. Only the
    // first load may show the full loading state; a reset must never flash
    // the list back to the first-page skeleton.
    void queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStream(ledgerId) });
    void queryClient.invalidateQueries({
      predicate: invalidateSourceDocumentStreamTotal(ledgerId),
    });
    void queryClient.invalidateQueries({ predicate: invalidateLedgerSettings(ledgerId) });
    void queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) });
    return;
  }
  if (!result.changed) return;

  for (const id of result.tombstones) applyOptimisticDelete(queryClient, ledgerId, id);
  for (const document of result.documents) {
    applyServerRefreshUpsert(queryClient, ledgerId, document);
  }
  if (result.counts != null) {
    queryClient.setQueryData(queryKeys.sourceDocumentCounts(ledgerId), result.counts);
  }
  // Local merge is the instant experience; a background refetch of the loaded
  // windows calibrates pagination boundaries without clearing current data.
  void queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStream(ledgerId) });
  void queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStreamTotal(ledgerId) });
  if (result.invalidations.categories || result.invalidations.settings) {
    void queryClient.invalidateQueries({ predicate: invalidateLedgerSettings(ledgerId) });
  }
  if (result.invalidations.stats) {
    void queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) });
  }
  writeLedgerSyncVersion(ledgerId, result.toVersion);
}
