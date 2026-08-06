"use client";

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type {
  MutationReconciliation,
  StreamPage,
  SourceDocumentListItemDto,
} from "@/modules/source-document/contracts";
import {
  mergeStreamPageData,
  STREAM_PAGE_LIMIT,
} from "@/modules/source-document/stream-cache-merge";

export type SourceDocumentEntityStore = Record<string, SourceDocumentListItemDto>;

export function seedSourceDocumentEntities(
  queryClient: QueryClient,
  ledgerId: string,
  items: readonly SourceDocumentListItemDto[]
): void {
  // Page responses are authoritative snapshots for these IDs. Replace stale
  // optimistic/detail data while preserving unrelated entities in the store.
  queryClient.setQueryData<SourceDocumentEntityStore>(
    queryKeys.sourceDocumentEntities(ledgerId),
    (current = {}) => {
      let changed = false;
      const next = { ...current };
      for (const item of items) {
        // Page responses are authoritative snapshots, but a stale page
        // response must never overwrite a newer reconciliation entity.
        const existing = next[item.id];
        if (existing != null && existing.updatedAt > item.updatedAt) continue;
        if (existing !== item) {
          next[item.id] = item;
          changed = true;
        }
      }
      return changed ? next : current;
    }
  );
}

export function upsertSourceDocumentEntity(
  queryClient: QueryClient,
  ledgerId: string,
  item: SourceDocumentListItemDto,
  guardVersion = true
): void {
  queryClient.setQueryData<SourceDocumentEntityStore>(
    queryKeys.sourceDocumentEntities(ledgerId),
    (current = {}) => {
      const existing = current[item.id];
      if (guardVersion && existing != null && existing.updatedAt > item.updatedAt) {
        return current;
      }
      return { ...current, [item.id]: item };
    }
  );
}

function deleteSourceDocumentEntity(
  queryClient: QueryClient,
  ledgerId: string,
  itemId: string
): void {
  queryClient.setQueryData<SourceDocumentEntityStore>(
    queryKeys.sourceDocumentEntities(ledgerId),
    (current = {}) => {
      if (current[itemId] == null) return current;
      const next = { ...current };
      delete next[itemId];
      return next;
    }
  );
}

// ---------------------------------------------------------------------------
// Optimistic Stream cache helpers
// ---------------------------------------------------------------------------

/**
 * Extract filter parameters from a stream query key.
 * The query key structure is:
 *   ["sourceDocuments", ledgerId, "stream", startDate, endDate, minAmount, maxAmount, statuses, search]
 */
function extractFiltersFromQueryKey(queryKey: readonly unknown[]): {
  startDate: string | null;
  endDate: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  statuses: string | null;
  search: string | null;
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
    search: (queryKey[8] as string) ?? null,
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
    minAmount: number | null;
    maxAmount: number | null;
    search: string | null;
  }
): boolean {
  // Check status filter
  if (filters.statuses != null && filters.statuses !== "") {
    const statusList = filters.statuses.split(",").map((s) => s.trim());
    if (!statusList.includes(item.status)) {
      return false;
    }
  }

  // Stream filtering uses the business date, falling back to the submission date.
  const effectiveDate = item.entryDate ?? item.createdAt.slice(0, 10);
  if (filters.startDate != null && effectiveDate < filters.startDate) return false;
  if (filters.endDate != null && effectiveDate > filters.endDate) return false;

  if (filters.search != null && filters.search !== "") {
    const needle = filters.search.toLocaleLowerCase();
    const titleMatch = item.title?.toLocaleLowerCase().includes(needle) ?? false;
    const entryMatch = (item.ledgerEntries ?? []).some(
      (entry) =>
        entry.itemName.toLocaleLowerCase().includes(needle) ||
        (entry.description?.toLocaleLowerCase().includes(needle) ?? false)
    );
    if (!titleMatch && !entryMatch) return false;
  }

  // I2: Check the persisted main-currency amount range. Entries without a
  // conversion are intentionally not treated as 1:1 matches.
  if (filters.minAmount != null || filters.maxAmount != null) {
    const amounts = (item.ledgerEntries ?? [])
      .map((e) => {
        if (e.convertedAmount == null) return null;
        const n = Number(e.convertedAmount);
        return Number.isNaN(n) ? null : n;
      })
      .filter((n): n is number => n != null);

    if (amounts.length === 0) return false;
    const matchesRange = amounts.some(
      (amount) =>
        (filters.minAmount == null || amount >= filters.minAmount) &&
        (filters.maxAmount == null || amount <= filters.maxAmount)
    );
    if (!matchesRange) return false;
  }

  return true;
}

/**
 * Apply an optimistic upsert of a source document item to the Stream cache.
 * The entity is merged in server order into every loaded window and pages are
 * re-sliced to the original capacity. Windows the entity no longer matches
 * (after a date/status edit) drop it immediately.
 *
 * I1: Only patches queries where the entity matches the query's filter
 * criteria (status, date range). Filters out non-matching queries to prevent
 * corrupting filtered/paginated views.
 */
export function applyOptimisticUpsert(
  queryClient: QueryClient,
  ledgerId: string,
  item: SourceDocumentListItemDto,
  updateDetail = true
): void {
  // Mutation reconciliation entities are intentionally minimal (files and
  // entries are overlaid by the refresh cycle), so rollback/reconciliation
  // must not be blocked by version guards.
  upsertSourceDocumentEntity(queryClient, ledgerId, item, false);
  const matches = getStreamQueryMatches(queryClient, ledgerId);

  for (const [queryKey, data] of matches) {
    if (!data) continue;
    const filters = extractFiltersFromQueryKey(queryKey);
    const belongs = (candidate: SourceDocumentListItemDto) =>
      filters == null || itemMatchesFilters(candidate, filters);
    queryClient.setQueryData<InfiniteData<StreamPage>>(
      queryKey,
      mergeStreamPageData(
        data,
        { upserts: [item], tombstones: [] },
        belongs,
        STREAM_PAGE_LIMIT,
        ledgerId,
        false
      )
    );
  }

  // Also update detail cache if it exists
  if (updateDetail) upsertDetailCache(queryClient, ledgerId, item);
}

/**
 * Applies a server delta document to the Stream cache as a pure merge.
 * Unlike the previous behavior, membership or ordering changes never reset
 * the query: the entity is inserted at its server-order position, stale
 * entities are replaced only by newer versions, and the window is re-sliced.
 */
export function applyServerRefreshUpsert(
  queryClient: QueryClient,
  ledgerId: string,
  item: SourceDocumentListItemDto
): void {
  upsertSourceDocumentEntity(queryClient, ledgerId, item);
  for (const [queryKey, data] of getStreamQueryMatches(queryClient, ledgerId)) {
    if (data == null) continue;
    const filters = extractFiltersFromQueryKey(queryKey);
    const belongs = (candidate: SourceDocumentListItemDto) =>
      filters == null || itemMatchesFilters(candidate, filters);
    queryClient.setQueryData<InfiniteData<StreamPage>>(
      queryKey,
      mergeStreamPageData(
        data,
        { upserts: [item], tombstones: [] },
        belongs,
        STREAM_PAGE_LIMIT,
        ledgerId
      )
    );
  }
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
  deleteSourceDocumentEntity(queryClient, ledgerId, itemId);
  const matches = getStreamQueryMatches(queryClient, ledgerId);

  for (const [queryKey, data] of matches) {
    if (!data) continue;
    queryClient.setQueryData<InfiniteData<StreamPage>>(
      queryKey,
      mergeStreamPageData(
        data,
        { upserts: [], tombstones: [itemId] },
        () => true,
        STREAM_PAGE_LIMIT,
        ledgerId
      )
    );
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

/**
 * Unified reconciliation entrypoint for single-document mutations.
 *
 * Applies the returned entity in server order, or removes the document for
 * tombstones. Minimal reconciliation entities (files/entries intentionally
 * empty until the refresh cycle overlays authoritative data) are merged over
 * the cached entity so title/date/status updates land instantly without
 * blanking the card. Returns whether a reconciliation was applied.
 */
export function applySourceDocumentReconciliation(
  queryClient: QueryClient,
  ledgerId: string,
  sourceDocumentId: string,
  reconciliation: MutationReconciliation<SourceDocumentListItemDto> | null | undefined
): boolean {
  if (reconciliation == null) return false;
  if (reconciliation.entity == null) {
    applyOptimisticDelete(queryClient, ledgerId, sourceDocumentId);
    return true;
  }

  const entity = reconciliation.entity;
  const existing = queryClient.getQueryData<SourceDocumentEntityStore>(
    queryKeys.sourceDocumentEntities(ledgerId)
  )?.[entity.id];
  applyOptimisticUpsert(queryClient, ledgerId, mergeReconciliationItem(existing, entity));
  return true;
}

/**
 * Merge a minimal reconciliation entity over the cached entity. Fields the
 * reconciliation intentionally leaves empty (files, entries, hasImages) and
 * absent values (title/entryDate) never blank existing card data.
 */
function mergeReconciliationItem(
  existing: SourceDocumentListItemDto | undefined,
  incoming: SourceDocumentListItemDto
): SourceDocumentListItemDto {
  if (existing == null) return incoming;
  return {
    ...existing,
    ...incoming,
    title: incoming.title != null && incoming.title !== "" ? incoming.title : existing.title,
    entryDate:
      incoming.entryDate != null && incoming.entryDate !== ""
        ? incoming.entryDate
        : existing.entryDate,
    files: incoming.files.length > 0 ? incoming.files : existing.files,
    hasImages: incoming.hasImages || existing.hasImages,
    ledgerEntries:
      incoming.ledgerEntries != null && incoming.ledgerEntries.length > 0
        ? incoming.ledgerEntries
        : (existing.ledgerEntries ?? []),
  };
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

export function applyDetailToStreamCaches(
  queryClient: QueryClient,
  ledgerId: string,
  detail: {
    id: string;
    title: string | null;
    entryDate: string | null;
    status: SourceDocumentListItemDto["status"];
    ledgerEntries?: SourceDocumentListItemDto["ledgerEntries"];
    files: SourceDocumentListItemDto["files"];
    supportedActions: SourceDocumentListItemDto["supportedActions"];
    errorCode: SourceDocumentListItemDto["errorCode"];
  }
): void {
  for (const [, data] of getStreamQueryMatches(queryClient, ledgerId)) {
    const existing = data?.pages
      .flatMap((page) => page.items)
      .find((item) => item.id === detail.id);
    if (existing != null) {
      const { ledgerEntries, ...detailWithoutEntries } = detail;
      applyOptimisticUpsert(
        queryClient,
        ledgerId,
        {
          ...existing,
          ...detailWithoutEntries,
          ...(ledgerEntries != null ? { ledgerEntries } : {}),
        },
        false
      );
      return;
    }
  }
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
