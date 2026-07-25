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
 * - Patching individual detail cache entries (both light and full detail)
 * - Updating global counts
 * - Cache rebase on generation/ordering changes
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
      // I1: Patch both light and full detail caches
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

      // Also patch the full detail cache
      const detailQueryKey = queryKeys.sourceDocument(watched.id);
      const detailExisting = queryClient.getQueryData(detailQueryKey);
      if (detailExisting) {
        queryClient.setQueryData(detailQueryKey, {
          ...(detailExisting as Record<string, unknown>),
          status: watched.doc.status,
          title: watched.doc.title,
          entryDate: watched.doc.entryDate,
          updatedAt: watched.doc.updatedAt,
          hasImages: watched.doc.hasImages,
          supportedActions: watched.doc.supportedActions,
          errorCode: watched.doc.errorCode,
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
 * Handles C4 cache rebase on generation/ordering changes.
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

    const newGeneration = page.generation ?? 0;
    const oldGeneration = firstPage.generation ?? 0;

    // C4: On generation change — full rebase (drop pages 2+)
    if (newGeneration !== oldGeneration) {
      queryClient.setQueryData(queryKey, {
        pages: [page],
        pageParams: data.pageParams.slice(0, 1),
      });
      return;
    }

    const newIds = new Set(page.items.map((i) => i.id));

    // C4: When new first page and old second page overlap unexpectedly,
    // do a partial rebase (drop pages 2+) because ordering changed.
    const secondPage = restPages[0];
    if (secondPage && secondPage.items.length > 0) {
      const firstOfSecond = secondPage.items[0];
      const firstOfSecondInNewPage = firstOfSecond != null && newIds.has(firstOfSecond.id);
      const overlapWithSecond = secondPage.items.filter((item) => newIds.has(item.id)).length;
      // C2: If old page 2's first item now appears in new page 1, or more than 1
      // item from old page 2 appears in new page 1, the ordering shifted
      // significantly — drop subsequent pages
      if (firstOfSecondInNewPage || overlapWithSecond > 1) {
        queryClient.setQueryData(queryKey, {
          pages: [page],
          pageParams: data.pageParams.slice(0, 1),
        });
        return;
      }
    }

    // Standard deduplication — filter out items from rest pages that now appear on page 1
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
