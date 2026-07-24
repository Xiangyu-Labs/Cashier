"use client";

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { StreamPage, SourceDocumentListItemDto } from "@/modules/source-document/contracts";

// ---------------------------------------------------------------------------
// Optimistic Stream cache helpers
// ---------------------------------------------------------------------------

/**
 * Extract filter parameters from a stream query key.
 * The query key structure is:
 *   ["sourceDocuments", ledgerId, "stream", startDate, endDate, minAmount, maxAmount, statuses]
 */
function extractFiltersFromQueryKey(
  queryKey: readonly unknown[]
): {
  startDate: string | null;
  endDate: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  statuses: string | null;
} | null {
  if (
    !Array.isArray(queryKey) ||
    queryKey.length < 8 ||
    queryKey[0] !== "sourceDocuments" ||
    queryKey[2] !== "stream"
  ) {
    return null;
  }
  return {
    startDate: (queryKey[3] as string) ?? null,
    endDate: (queryKey[4] as string) ?? null,
    minAmount: (queryKey[5] as number) ?? null,
    maxAmount: (queryKey[6] as number) ?? null,
    statuses: (queryKey[7] as string) ?? null,
  };
}

/**
 * Check whether a source document item matches a specific filter window.
 * If the query has no filters, the item always belongs.
 * Returns false if the item should be excluded from this query's results.
 */
function itemMatchesFilters(
  item: SourceDocumentListItemDto,
  filters: {
    startDate: string | null;
    endDate: string | null;
    statuses: string | null;
  }
): boolean {
  // Check status filter
  if (filters.statuses != null && filters.statuses !== "") {
    const statusList = filters.statuses.split(",").map((s) => s.trim());
    if (!statusList.includes(item.status)) {
      return false;
    }
  }

  // Check date range
  if (filters.startDate != null && item.entryDate != null) {
    if (item.entryDate < filters.startDate) return false;
  }
  if (filters.endDate != null && item.entryDate != null) {
    if (item.entryDate > filters.endDate) return false;
  }

  return true;
}

/**
 * Apply an optimistic upsert of a source document item to the Stream cache.
 * If the entity already exists (by ID), it is updated in-place. Otherwise it
 * is prepended to the first page.
 *
 * I1: Only patches queries where the entity matches the query's filter
 * criteria (status, date range). Filters out non-matching queries to prevent
 * corrupting filtered/paginated views.
 */
export function applyOptimisticUpsert(
  queryClient: QueryClient,
  ledgerId: string,
  item: SourceDocumentListItemDto
): void {
  const matches = getStreamQueryMatches(queryClient, ledgerId);

  for (const [queryKey, data] of matches) {
    if (!data) continue;
    const { pages, pageParams } = data;
    if (!pages || pages.length === 0) continue;

    // I1: Check if the item belongs in this filter window
    const filters = extractFiltersFromQueryKey(queryKey);
    if (filters != null && !itemMatchesFilters(item, filters)) {
      // Item doesn't belong in this filtered view — skip
      continue;
    }

    const updatedPages = pages.map((page, pageIndex) => {
      const existingIdx = page.items.findIndex((i) => i.id === item.id);
      if (existingIdx !== -1) {
        if (pageIndex === 0) {
          const updatedItems = [...page.items];
          updatedItems[existingIdx] = item;
          return { ...page, items: updatedItems };
        }
      }
      return page;
    });

    // If the entity doesn't exist in any page, prepend to the first page
    const existsInAny = pages.some((p) => p.items.some((i) => i.id === item.id));
    if (!existsInAny) {
      const firstPage = updatedPages[0];
      if (firstPage) {
        updatedPages[0] = {
          ...firstPage,
          items: [item, ...firstPage.items].slice(0, 20), // I1: Maintain page limit
        };
      }
    }

    queryClient.setQueryData<InfiniteData<StreamPage>>(queryKey, {
      pages: updatedPages,
      pageParams,
    });
  }

  // Also update detail cache if it exists
  upsertDetailCache(queryClient, ledgerId, item);
}

/**
 * Apply an optimistic delete of a source document from the Stream cache.
 */
export function applyOptimisticDelete(
  queryClient: QueryClient,
  ledgerId: string,
  itemId: string
): void {
  const matches = getStreamQueryMatches(queryClient, ledgerId);

  for (const [queryKey, data] of matches) {
    if (!data) continue;
    const { pages, pageParams } = data;
    if (!pages || pages.length === 0) continue;

    const updatedPages = pages.map((page) => ({
      ...page,
      items: page.items.filter((i) => i.id !== itemId),
    }));

    queryClient.setQueryData<InfiniteData<StreamPage>>(queryKey, {
      pages: updatedPages,
      pageParams,
    });
  }

  // Also remove from detail caches
  queryClient.removeQueries({ queryKey: queryKeys.sourceDocument(itemId) });
  queryClient.removeQueries({ queryKey: queryKeys.sourceDocumentLight(itemId) });
}

/**
 * Apply an optimistic count delta to the counts cache.
 */
export function applyOptimisticCounts(
  queryClient: QueryClient,
  ledgerId: string,
  delta: { processing: number; attention: number }
): void {
  const countsKey = queryKeys.sourceDocumentCounts(ledgerId);
  queryClient.setQueryData<{
    processingCount: number;
    attentionCount: number;
  }>(countsKey, (old) => {
    if (!old) return old;
    return {
      processingCount: Math.max(0, old.processingCount + delta.processing),
      attentionCount: Math.max(0, old.attentionCount + delta.attention),
    };
  });
}

/**
 * Revert an earlier optimistic upsert by restoring the previous entity,
 * or deleting the inserted entity if it was new.
 */
export function revertOptimisticUpsert(
  queryClient: QueryClient,
  ledgerId: string,
  prevItem: SourceDocumentListItemDto | null,
  entityId: string
): void {
  if (prevItem != null) {
    applyOptimisticUpsert(queryClient, ledgerId, prevItem);
  } else {
    applyOptimisticDelete(queryClient, ledgerId, entityId);
  }
}

/**
 * Revert an earlier optimistic delete by re-inserting the entity.
 */
export function revertOptimisticDelete(
  queryClient: QueryClient,
  ledgerId: string,
  item: SourceDocumentListItemDto
): void {
  applyOptimisticUpsert(queryClient, ledgerId, item);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get all stream cache query matches for a ledger.
 * Exported for use by ledger-entry mutation hooks.
 */
export function getStreamQueryMatches(
  queryClient: QueryClient,
  ledgerId: string
): Array<[readonly unknown[], InfiniteData<StreamPage> | undefined]> {
  const streamPrefix = queryKeys.sourceDocumentStreamPrefix(ledgerId);
  return queryClient.getQueriesData<InfiniteData<StreamPage>>({
    queryKey: streamPrefix,
  });
}

/**
 * Find a source document item by its entry ID in the Stream cache.
 * Returns the source document list item and its stream page, or null if not found.
 */
export function findSourceDocByEntryId(
  queryClient: QueryClient,
  ledgerId: string,
  entryId: string
): { sourceDoc: SourceDocumentListItemDto; pageIndex: number; itemIndex: number } | null {
  const matches = getStreamQueryMatches(queryClient, ledgerId);

  for (const [, data] of matches) {
    if (!data) continue;
    const { pages } = data;
    if (!pages || pages.length === 0) continue;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const page = pages[pageIdx];
      if (page == null) continue;
      for (let itemIdx = 0; itemIdx < page.items.length; itemIdx++) {
        const item = page.items[itemIdx];
        if (item == null) continue;
        if (item.ledgerEntries?.some((entry) => entry.id === entryId)) {
          return { sourceDoc: item, pageIndex: pageIdx, itemIndex: itemIdx };
        }
      }
    }
  }

  return null;
}

function upsertDetailCache(
  queryClient: QueryClient,
  ledgerId: string,
  item: SourceDocumentListItemDto
): void {
  // Update light detail cache if it exists
  const lightKey = queryKeys.sourceDocumentLight(item.id);
  const existingLight = queryClient.getQueryData(lightKey);
  if (existingLight) {
    queryClient.setQueryData(lightKey, {
      ...(existingLight as Record<string, unknown>),
      status: item.status,
      title: item.title,
      entryDate: item.entryDate,
      updatedAt: item.updatedAt,
      supportedActions: item.supportedActions,
      errorCode: item.errorCode,
    });
  }

  // Update full detail cache if it exists
  const detailKey = queryKeys.sourceDocument(item.id);
  const existingDetail = queryClient.getQueryData(detailKey);
  if (existingDetail) {
    queryClient.setQueryData(detailKey, {
      ...(existingDetail as Record<string, unknown>),
      status: item.status,
      title: item.title,
      entryDate: item.entryDate,
      updatedAt: item.updatedAt,
      supportedActions: item.supportedActions,
      errorCode: item.errorCode,
    });
  }
}
