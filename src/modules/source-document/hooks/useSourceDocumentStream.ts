"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { listStreamPageAction } from "@/modules/source-document/actions";
import type {
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
} from "@/modules/source-document/contracts";
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

const STREAM_PAGE_LIMIT = 20;

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
  const streamPageKey = queryKeys.sourceDocumentStream(ledgerId, {
    startDate,
    endDate,
    ...(minAmount != null ? { minAmount } : {}),
    ...(maxAmount != null ? { maxAmount } : {}),
    statuses: statusesKey,
    search: search ?? null,
  });

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
  // C3: Persist first page fingerprint from server for refresh comparison

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: streamPageKey,
    queryFn: ({ pageParam }) =>
      listStreamPageAction(ledgerId, {
        ...(startDate !== null ? { startDate } : {}),
        ...(endDate !== null ? { endDate } : {}),
        ...(minAmount != null ? { minAmount } : {}),
        ...(maxAmount != null ? { maxAmount } : {}),
        ...(stableStatuses != null && stableStatuses.length > 0
          ? { statuses: stableStatuses }
          : {}),
        ...(search != null && search !== "" ? { search } : {}),
        cursor: pageParam,
        limit: STREAM_PAGE_LIMIT,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data: entities = {} } = useQuery<SourceDocumentEntityStore>({
    queryKey: queryKeys.sourceDocumentEntities(ledgerId),
    queryFn: async () => ({}),
    initialData: {},
    enabled: false,
  });

  useEffect(() => {
    const pageItems = data?.pages.flatMap((page) => page.items) ?? [];
    if (pageItems.length > 0) seedSourceDocumentEntities(queryClient, ledgerId, pageItems);
  }, [data, ledgerId, queryClient]);

  // Check generation consistency across pages (Fix 3).
  // If a subsequent page has a different generation than the first page,
  // reset the query so it restarts from page 1 with the new ordering/schema.
  // Also check for restartRequired (Fix 2) — invalid cursor / stale data
  // requiring the client to discard pages and restart from page one.
  useEffect(() => {
    const pages = data?.pages;
    if (!pages || pages.length === 0) return;

    // Fix 2: Detect restartRequired from cursor validation failure
    const anyRestart = pages.some((p) => p.restartRequired);
    if (anyRestart) {
      queryClient.resetQueries({ queryKey: streamPageKey });
      return;
    }

    const firstGen = pages[0]?.generation;
    if (firstGen == null) return;

    if (generationRef.current === null) {
      generationRef.current = firstGen;
    } else if (firstGen !== generationRef.current) {
      // The first page generation changed (e.g. after a server deployment).
      generationRef.current = firstGen;
      queryClient.resetQueries({ queryKey: streamPageKey });
    } else if (pages.length > 1) {
      // Check all loaded pages share the same generation
      const anyMismatch = pages.some((p) => p.generation !== firstGen);
      if (anyMismatch) {
        queryClient.resetQueries({ queryKey: streamPageKey });
      }
    }
  }, [data, queryClient, streamPageKey]);

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
      const item = entities[id] ?? pageFallbacks.get(id);
      return item == null ? [] : [item];
    });
  }, [data, entities, windowItemIds]);
  const hasProcessingItems = items.some((item) => item.status === "processing");

  // Fast polling is active only while this window contains transitional work.
  useRevisionStateRefresh({
    scope: `stream:${ledgerId}:${filterSignature}`,
    enabled: enableRefresh,
    pending: hasProcessingItems,
    refresh,
  });

  // Build unified stream groups (preserving server order)
  const streamGroups: UnifiedStreamGroup[] = useMemo(() => {
    return buildUnifiedStreamGroups(items);
  }, [items]);

  return {
    streamGroups,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    /** Call the bounded refresh path (pull-to-refresh, etc.) */
    refresh,
  };
}
