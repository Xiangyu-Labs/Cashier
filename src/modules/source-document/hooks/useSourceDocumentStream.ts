"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { listStreamPageAction } from "@/modules/source-document/actions";
import type { SourceDocumentListItemDto, SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTimeForApi } from "@/lib/date-utils";
import {
  buildUnifiedStreamGroups,
  type UnifiedStreamGroup,
} from "@/modules/source-document/stream-grouping";
import { getStreamRefreshAction } from "@/modules/source-document/actions";
import { applyStreamRefreshToCache } from "@/modules/source-document/hooks/stream-refresh-cache";
import { useRevisionStateRefresh } from "./revision-state-refresh";

const STREAM_PAGE_LIMIT = 20;

export interface UseSourceDocumentStreamOptions {
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  minAmount?: number;
  maxAmount?: number;
  /** Canonical selected statuses. Empty/undefined means all statuses. */
  statuses?: SourceDocumentStatusType[];
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
}): string {
  const statusParts = params.statusesKey != null ? params.statusesKey.split(",").sort() : [];
  const parts = [
    params.startDate ?? "",
    params.endDate ?? "",
    params.minAmount?.toString() ?? "",
    params.maxAmount?.toString() ?? "",
    ...statusParts,
  ];
  return parts.join("|");
}

export function useSourceDocumentStream(
  ledgerId: string,
  options: UseSourceDocumentStreamOptions = {}
) {
  const queryClient = useQueryClient();
  const { dateRange, minAmount, maxAmount, statuses: rawStatuses, enableRefresh = true } = options;

  const startDate = formatDateTimeForApi(dateRange?.start) ?? null;
  const endDate = formatDateTimeForApi(dateRange?.end) ?? null;

  // Normalize statuses: sort and deduplicate for stable cache keys and
  // consistent filter fingerprints (Fix 6).
  const stableStatuses = useMemo(
    () =>
      rawStatuses != null && rawStatuses.length > 0
        ? [...new Set(rawStatuses)].sort()
        : undefined,
    [rawStatuses]
  );
  const statusesKey = stableStatuses != null && stableStatuses.length > 0 ? stableStatuses.join(",") : null;

  // Build stream page key that includes all filter params
  const streamPageKey = queryKeys.sourceDocumentStream(ledgerId, {
    startDate,
    endDate,
    ...(minAmount != null ? { minAmount } : {}),
    ...(maxAmount != null ? { maxAmount } : {}),
    statuses: statusesKey,
  });

  // Compute filter signature for refresh coordination
  const filterSignature = useMemo(
    () => encodeFilterSignature({ startDate, endDate, minAmount: minAmount ?? null, maxAmount: maxAmount ?? null, statusesKey }),
    [startDate, endDate, minAmount, maxAmount, statusesKey]
  );

  // Track the generation from the first page for cross-page consistency
  const generationRef = useRef<number | null>(null);
  // Track first page fingerprint for refresh comparison
  const firstPageFingerprintRef = useRef<string | null>(null);
  const firstPageFingerprint = useRef<string>("");

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: streamPageKey,
    queryFn: ({ pageParam }) =>
      listStreamPageAction(ledgerId, {
        ...(startDate !== null ? { startDate } : {}),
        ...(endDate !== null ? { endDate } : {}),
        ...(minAmount != null ? { minAmount } : {}),
        ...(maxAmount != null ? { maxAmount } : {}),
        ...(stableStatuses != null && stableStatuses.length > 0 ? { statuses: stableStatuses } : {}),
        cursor: pageParam,
        limit: STREAM_PAGE_LIMIT,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

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

    // Update first page fingerprint whenever data changes
    firstPageFingerprint.current = data?.pages?.[0]?.items
      ? data.pages[0].items.map((i) => `${i.id}:${i.updatedAt}`).join(",")
      : "";
  }, [data, queryClient, streamPageKey]);

  // Refresh function — calls the bounded refresh endpoint
  const refresh = useCallback(async (): Promise<{ changed: boolean }> => {
    try {
      // Counts refresh is handled by the coordinator separately
      const result = await getStreamRefreshAction(ledgerId, {
        ledgerId,
        protocolVersion: 1,
        signatures: [
          {
            filterSignature,
            firstPageFingerprint: firstPageFingerprint.current || null,
          },
        ],
        watchedIds: [],
        countFingerprint: null, // counts are managed by Header
      });

      applyStreamRefreshToCache(queryClient, ledgerId, result);
      return { changed: result.changed };
    } catch {
      return { changed: false };
    }
  }, [ledgerId, filterSignature, queryClient]);

  // Register with the refresh coordinator for polling
  useRevisionStateRefresh({
    scope: `stream:${ledgerId}:${filterSignature}`,
    enabled: enableRefresh,
    pending: true, // Always pending for stream refresh
    refresh,
  });

  // Flatten pages and deduplicate by ID preserving server order
  const items = useMemo(() => {
    const pages = data?.pages ?? [];
    const allItems = pages.flatMap((page) => page.items);
    return deduplicate(allItems);
  }, [data]);

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
