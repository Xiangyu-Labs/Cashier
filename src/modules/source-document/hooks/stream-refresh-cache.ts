import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { LedgerRefreshResult } from "../contract-refresh";

export function applyStreamRefreshToCache(
  queryClient: QueryClient,
  ledgerId: string,
  result: LedgerRefreshResult
): Promise<void> {
  const invalidations = new Map<string, { queryKey: readonly unknown[]; exact?: true }>();
  const add = (queryKey: readonly unknown[], exact?: true) => {
    invalidations.set(JSON.stringify(queryKey), {
      queryKey,
      ...(exact === true ? { exact: true } : {}),
    });
  };

  if (result.changed) {
    add(queryKeys.sourceDocumentStreamPrefix(ledgerId));
    add(queryKeys.sourceDocumentStreamTotalPrefix(ledgerId));
    add(queryKeys.ledgerEntriesPrefix(ledgerId));
    add(queryKeys.ledgerEntryPrefix(ledgerId));
    add(queryKeys.sourceDocumentDetailPrefix(ledgerId));
  }
  if (result.invalidations.categories) {
    add(queryKeys.entryCategories(ledgerId), true);
    add(queryKeys.sourceDocumentStreamPrefix(ledgerId));
    add(queryKeys.ledgerEntriesPrefix(ledgerId));
    add(queryKeys.ledgerEntryPrefix(ledgerId));
    add(queryKeys.sourceDocumentDetailPrefix(ledgerId));
    add(queryKeys.summaryPrefix(ledgerId));
    add(queryKeys.enhancedStatsPrefix(ledgerId));
  }
  if (result.invalidations.settings) {
    add(queryKeys.ledger(ledgerId), true);
    add(queryKeys.ledgerSettings(ledgerId), true);
    add(queryKeys.summaryPrefix(ledgerId));
    add(queryKeys.enhancedStatsPrefix(ledgerId));
    add(queryKeys.calendarPrefix(ledgerId));
  }
  if (result.invalidations.stats) {
    add(queryKeys.summaryPrefix(ledgerId));
    add(queryKeys.tokenStats(ledgerId), true);
    add(queryKeys.enhancedStatsPrefix(ledgerId));
    add(queryKeys.calendarPrefix(ledgerId));
    add(queryKeys.sourceDocumentStreamTotalPrefix(ledgerId));
  }

  return Promise.all(
    [...invalidations.values()].map((filters) =>
      queryClient.invalidateQueries({ ...filters, refetchType: "active" })
    )
  ).then(() => undefined);
}
