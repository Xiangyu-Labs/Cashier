import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateLedgerSettings,
  invalidateLedgerStats,
  invalidateSourceDocumentCounts,
  invalidateSourceDocuments,
  invalidateSourceDocumentStream,
  invalidateSourceDocumentStreamTotal,
} from "@/lib/query-keys";
import type { LedgerDeltaResult } from "../contract-refresh";

export function applyStreamRefreshToCache(
  queryClient: QueryClient,
  ledgerId: string,
  result: LedgerDeltaResult
): void {
  if (result.changed || result.resetRequired) {
    void queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStream(ledgerId) });
    void queryClient.invalidateQueries({
      predicate: invalidateSourceDocumentStreamTotal(ledgerId),
    });
    void queryClient.invalidateQueries({ predicate: invalidateSourceDocumentCounts(ledgerId) });
    void queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) });
  }
  if (result.invalidations.categories || result.invalidations.settings) {
    void queryClient.invalidateQueries({ predicate: invalidateLedgerSettings(ledgerId) });
  }
  if (result.invalidations.stats) {
    void queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) });
  }
}
