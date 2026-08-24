import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateLedgerEntries,
  invalidateLedgerEntryDetails,
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
): Promise<void> {
  const invalidations: Array<Promise<unknown>> = [];
  if (result.changed || result.resetRequired) {
    invalidations.push(
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStream(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentStreamTotal(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateSourceDocumentCounts(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateSourceDocuments(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntryDetails(ledgerId) })
    );
  }
  if (result.invalidations.categories || result.invalidations.settings) {
    invalidations.push(
      queryClient.invalidateQueries({ predicate: invalidateLedgerSettings(ledgerId) })
    );
  }
  if (result.invalidations.stats) {
    invalidations.push(
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) })
    );
  }
  return Promise.all(invalidations).then(() => undefined);
}
