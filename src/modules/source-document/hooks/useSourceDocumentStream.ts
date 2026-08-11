"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { listStreamPageAction } from "@/modules/source-document/actions";
import type {
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
  StreamPage,
} from "@/modules/source-document/contracts";
import type { ListStreamPageInput } from "../application/queries/list-stream-page";
import { canonicalizeSourceDocumentStatuses } from "@/modules/source-document/types";
import { queryKeys } from "@/lib/query-keys";
import {
  buildUnifiedStreamGroups,
  type UnifiedStreamGroup,
} from "@/modules/source-document/stream-grouping";
import { getStreamRefreshAction } from "@/modules/source-document/actions";
import {
  applyStreamRefreshToCache,
  readLedgerSyncVersion,
} from "@/modules/source-document/hooks/stream-refresh-cache";
import type { StreamRefreshResult } from "@/modules/source-document/contract-refresh";
import { useRevisionStateRefresh } from "./revision-state-refresh";
import {
  seedSourceDocumentEntities,
  type SourceDocumentEntityStore,
} from "./source-document-optimistic-cache";
import { STREAM_PAGE_LIMIT } from "@/modules/source-document/stream-cache-merge";

export interface UseSourceDocumentStreamOptions {
  dateRange?: {
    start?: string;
    end?: string;
  };
  minAmount?: number;
  maxAmount?: number;
  /** Canonical selected statuses. Empty/undefined means all statuses. */
  statuses?: SourceDocumentStatusType[];
  search?: string;
  /** Enable refresh polling for this stream. */
  enableRefresh?: boolean;
  /**
   * Optional shared descriptor supplied by the workspace tab. Keeping the
   * key and request input together prevents prefetch/hydration drift.
   */
  queryDescriptor?: {
    queryKey: readonly unknown[];
    getPageInput: (pageParam?: string) => ListStreamPageInput;
  };
}

/**
 * Deduplicate a list of source documents by id, preserving server order.
 * First occurrence wins.
 */
function deduplicate(docs: SourceDocumentListItemDto[]): SourceDocumentListItemDto[] {
  const seen = new Set<string>();
  const result: SourceDocumentListItemDto[] = [];
  for (const doc of docs) {
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      result.push(doc);
    }
  }
  return result;
}

/**
 * Encode filter params into a stable signature string.
 * This is used as the filter signature in refresh requests.
 */
function encodeFilterSignature(params: {
  startDate: string | null;
  endDate: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  statusesKey: string | null;
  search: string | null;
}): string {
  const statusParts = params.statusesKey != null ? params.statusesKey.split(",").sort() : [];
  const parts = [
    params.startDate ?? "",
    params.endDate ?? "",
    params.minAmount?.toString() ?? "",
    params.maxAmount?.toString() ?? "",
    params.search != null ? encodeURIComponent(params.search) : "",
    ...statusParts,
  ];
  return parts.join("|");
}

export function useSourceDocumentStream(
  ledgerId: string,
  options: UseSourceDocumentStreamOptions = {}
) {
  const queryClient = useQueryClient();
  const {
    dateRange,
    minAmount,
    maxAmount,
    statuses: rawStatuses,
    search,
    enableRefresh = true,
    queryDescriptor,
  } = options;

  const startDate = dateRange?.start ?? null;
  const endDate = dateRange?.end ?? null;

  // Normalize statuses: sort and deduplicate for stable cache keys and
  // consistent filter fingerprints (Fix 6).
  // Kept as primitive string for React Compiler stability analysis.
  const canonicalStatuses = canonicalizeSourceDocumentStatuses(rawStatuses);
  const statusesKey = canonicalStatuses?.join(",") ?? null;
  // Split back to array for the query function parameter.
  const stableStatuses =
    statusesKey != null ? (statusesKey.split(",") as SourceDocumentStatusType[]) : undefined;

  // Build stream page key that includes all filter params
  const fallbackStreamPageKey = useMemo(
    () =>
      queryKeys.sourceDocumentStream(ledgerId, {
        startDate,
        endDate,
        ...(minAmount != null ? { minAmount } : {}),
        ...(maxAmount != null ? { maxAmount } : {}),
        statuses: statusesKey,
        search: search ?? null,
      }),
    [endDate, ledgerId, maxAmount, minAmount, search, startDate, statusesKey]
  );
  const streamPageKey = queryDescriptor?.queryKey ?? fallbackStreamPageKey;

  // Compute filter signature for refresh coordination
  const filterSignature = useMemo(
    () =>
      encodeFilterSignature({
        startDate,
        endDate,
        minAmount: minAmount ?? null,
        maxAmount: maxAmount ?? null,
        statusesKey,
        search: search ?? null,
      }),
    [startDate, endDate, minAmount, maxAmount, statusesKey, search]
  );

  // Track the generation from the first page for cross-page consistency
  const generationRef = useRef<number | null>(null);
  // Guards the background restart so a generation mismatch only triggers one
  // fresh first-page fetch while the old list stays visible.
  const restartingRef = useRef(false);
  // C3: Persist first page fingerprint from server for refresh comparison

  const streamQuery = useInfiniteQuery({
    queryKey: streamPageKey,
    queryFn: ({ pageParam }) =>
      listStreamPageAction(
        ledgerId,
        queryDescriptor?.getPageInput(pageParam as string | undefined) ?? {
          ...(startDate !== null ? { startDate } : {}),
          ...(endDate !== null ? { endDate } : {}),
          ...(minAmount != null ? { minAmount } : {}),
          ...(maxAmount != null ? { maxAmount } : {}),
          ...(stableStatuses != null && stableStatuses.length > 0
            ? { statuses: stableStatuses }
            : {}),
          ...(search != null && search !== "" ? { search } : {}),
          ...(pageParam != null ? { cursor: pageParam as string } : {}),
          limit: STREAM_PAGE_LIMIT,
        }
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = streamQuery;
  const { data: entities = {} } = useQuery<SourceDocumentEntityStore>({
    queryKey: queryKeys.sourceDocumentEntities(ledgerId),
    queryFn: async () => ({}),
    initialData: {},
    enabled: false,
  });

  useEffect(() => {
    const pageItems = data?.pages.flatMap((page) => page.items) ?? [];
    if (pageItems.length > 0) {
      seedSourceDocumentEntities(queryClient, ledgerId, pageItems, streamPageKey);
    }
  }, [data, ledgerId, queryClient, streamPageKey]);

  // A new filter window starts fresh: generation/restart state from the
  // previous window must not trigger a background restart for the new key.
  useEffect(() => {
    generationRef.current = null;
    restartingRef.current = false;
  }, [filterSignature]);

  // Check generation consistency across pages (Fix 3).
  // If a subsequent page has a different generation than the first page,
  // or the server signals restartRequired (invalid cursor / stale data),
  // restart from page 1 in the background. The old list stays visible until
  // the fresh first page succeeds; on failure the current list is preserved.
  useEffect(() => {
    const pages = data?.pages;
    if (!pages || pages.length === 0) return;

    const anyRestart = pages.some((p) => p.restartRequired);
    const firstGen = pages[0]?.generation;
    if (firstGen == null) return;

    if (generationRef.current === null) {
      generationRef.current = firstGen;
      return;
    }

    const generationChanged =
      anyRestart ||
      firstGen !== generationRef.current ||
      (pages.length > 1 && pages.some((p) => p.generation !== firstGen));
    if (!generationChanged) return;
    if (restartingRef.current) return;

    restartingRef.current = true;
    void (async () => {
      try {
        const fresh = await listStreamPageAction(
          ledgerId,
          queryDescriptor?.getPageInput(undefined) ?? {
            ...(startDate !== null ? { startDate } : {}),
            ...(endDate !== null ? { endDate } : {}),
            ...(minAmount != null ? { minAmount } : {}),
            ...(maxAmount != null ? { maxAmount } : {}),
            ...(stableStatuses != null && stableStatuses.length > 0
              ? { statuses: stableStatuses }
              : {}),
            ...(search != null && search !== "" ? { search } : {}),
            limit: STREAM_PAGE_LIMIT,
          }
        );
        generationRef.current = fresh.generation;
        queryClient.setQueryData<InfiniteData<StreamPage>>(streamPageKey, {
          pages: [fresh],
          pageParams: [undefined],
        });
      } catch {
        // Keep the old list — a failed restart must not clear the window.
      } finally {
        restartingRef.current = false;
      }
    })();
  }, [
    data,
    endDate,
    ledgerId,
    maxAmount,
    minAmount,
    queryClient,
    queryDescriptor,
    search,
    stableStatuses,
    startDate,
    streamPageKey,
  ]);

  const refresh = useCallback(async (): Promise<{
    changed: boolean;
    result?: StreamRefreshResult;
  }> => {
    let result: StreamRefreshResult | undefined;
    let changed = false;
    for (let page = 0; page < 10; page += 1) {
      result = await getStreamRefreshAction(ledgerId, {
        ledgerId,
        afterVersion: readLedgerSyncVersion(ledgerId),
      });
      applyStreamRefreshToCache(queryClient, ledgerId, result);
      changed ||= result.changed;
      if (!result.hasMore || result.resetRequired) break;
    }
    return { changed, ...(result === undefined ? {} : { result }) };
  }, [ledgerId, queryClient]);

  const windowItemIds = useMemo(
    () => deduplicate(data?.pages.flatMap((page) => page.items) ?? []).map((item) => item.id),
    [data]
  );
  const items = useMemo(() => {
    const pageFallbacks = new Map(
      (data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])
    );
    return windowItemIds.flatMap((id) => {
      const pageItem = pageFallbacks.get(id);
      if (pageItem == null) return [];
      const entity = entities[id];
      if (entity == null) return [pageItem];
      // Prefer the canonical entity's fresher scalar fields, but keep the
      // page item's entry projection so a filtered window never renders or
      // totals entries that did not match the query.
      return [{ ...pageItem, ...entity, ledgerEntries: pageItem.ledgerEntries ?? [] }];
    });
  }, [data, entities, windowItemIds]);
  // Keep the scope subscribed for the lifetime of the mounted stream. The
  // coordinator stops its timer after a successful terminal response, while
  // broadcast/focus/visibility/reconnect events can still wake it later.
  useRevisionStateRefresh({
    scope: `stream:${ledgerId}:${filterSignature}`,
    enabled: enableRefresh,
    pending: true,
    refresh,
  });

  // Build unified stream groups (preserving server order)
  const streamGroups: UnifiedStreamGroup[] = useMemo(() => {
    return buildUnifiedStreamGroups(items);
  }, [items]);

  return {
    streamGroups,
    isLoading,
    queryKey: streamPageKey,
    queryStatus: streamQuery.status,
    queryIsFetching: streamQuery.isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    /** Call the bounded explicit refresh path. */
    refresh,
  };
}
