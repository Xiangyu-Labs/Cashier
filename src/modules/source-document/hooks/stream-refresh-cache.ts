import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { StreamPage, SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { StreamRefreshResult } from "@/modules/source-document/contract-refresh";

/**
 * Apply refresh results to the TanStack Query cache.
 *
 * Handles:
 * - Matching stream queries by filter signature
 * - Replacing the first page items while retaining older loaded pages
 * - Deduplicating identities across pages
 * - Patching individual detail cache entries
 * - Updating global counts
 */
export function applyStreamRefreshToCache(
  queryClient: QueryClient,
  ledgerId: string,
  result: StreamRefreshResult
): void {
  if (!result.changed) return;

  // 1. Apply changed first pages
  for (const fp of result.firstPages) {
    if (fp.page == null) continue;
    patchFirstPage(queryClient, ledgerId, fp.filterSignature, fp.page);
  }

  // 2. Apply changed watched entities
  for (const watched of result.changedWatched) {
    if (watched.doc == null) {
      queryClient.setQueryData(queryKeys.sourceDocument(watched.id), null);
      queryClient.setQueryData(queryKeys.sourceDocumentLight(watched.id), null);
    } else {
      const lightQueryKey = queryKeys.sourceDocumentLight(watched.id);
      const existing = queryClient.getQueryData(lightQueryKey);
      if (existing) {
        queryClient.setQueryData(lightQueryKey, {
          ...(existing as Record<string, unknown>),
          status: watched.doc.status,
          title: watched.doc.title,
          entryDate: watched.doc.entryDate,
          updatedAt: watched.doc.updatedAt,
          hasImages: watched.doc.hasImages,
          supportedActions: watched.doc.supportedActions,
          errorCode: watched.doc.errorCode,
          ...(watched.doc.candidateComparison
            ? { candidateComparison: watched.doc.candidateComparison }
            : {}),
        });
      }
    }
  }

  // 3. Apply counts
  if (result.counts != null) {
    queryClient.setQueryData(queryKeys.sourceDocumentCounts(ledgerId), {
      processingCount: result.counts.processingCount,
      attentionCount: result.counts.attentionCount,
    });
  }
}

/**
 * Convert a query key to a normalized filter signature.
 * Format: startDate|endDate|minAmount|maxAmount|status1|status2|...
 */
export function queryKeyToFilterSignature(key: readonly unknown[]): string {
  if (!Array.isArray(key) || key.length < 8) return "";

  const [, , , startDate, endDate, minAmount, maxAmount, statuses] = key;

  const statusParts = statuses != null && statuses !== ""
    ? String(statuses).split(",").sort()
    : [];

  return [
    startDate ?? "",
    endDate ?? "",
    minAmount != null ? String(minAmount) : "",
    maxAmount != null ? String(maxAmount) : "",
    ...statusParts,
  ].join("|");
}

/**
 * Find the stream query matching the given filter signature and patch its first page.
 */
function patchFirstPage(
  queryClient: QueryClient,
  ledgerId: string,
  filterSignature: string,
  page: StreamPage
): void {
  // Search all cached queries for stream queries matching the filter signature
  const prefix: unknown[] = ["sourceDocuments", ledgerId, "stream"];
  const matches = queryClient.getQueriesData({ queryKey: prefix });

  for (const [queryKey, rawData] of matches) {
    if (!rawData) continue;

    const keySig = queryKeyToFilterSignature(queryKey as unknown[]);
    if (keySig !== filterSignature) continue;

    const data = rawData as InfiniteData<StreamPage>;
    const [firstPage, ...restPages] = data.pages;
    if (!firstPage) continue;

    const newIds = new Set(page.items.map((i) => i.id));
    const patchedPages: StreamPage[] = [
      page,
      ...restPages.map((rp) => ({
        ...rp,
        items: rp.items.filter((item) => !newIds.has(item.id)),
      })),
    ];

    queryClient.setQueryData(queryKey, {
      pages: patchedPages,
      pageParams: data.pageParams,
    });
  }
}
