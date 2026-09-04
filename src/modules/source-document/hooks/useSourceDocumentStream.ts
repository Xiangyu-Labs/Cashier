"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { listStreamPageAction } from "@/modules/source-document/server-actions/queries";
import type {
  SourceDocumentListItemDto,
  SourceDocumentStatusType,
} from "@/modules/source-document/contracts";
import type { ListStreamPageInput } from "../application/queries/list-stream-page";
import { canonicalizeSourceDocumentStatuses } from "@/modules/source-document/types";
import { queryKeys } from "@/lib/query-keys";
import {
  buildUnifiedStreamGroups,
  type UnifiedStreamGroup,
} from "@/modules/source-document/stream-grouping";
import type {
  LedgerRefreshResult,
  StreamRefreshResult,
} from "@/modules/source-document/contract-refresh";
import { useLedgerRefreshPolling } from "./useLedgerRefreshPolling";

const STREAM_PAGE_LIMIT = 20;

export interface UseSourceDocumentStreamOptions {
  mainCurrency?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
  minAmount?: string;
  maxAmount?: string;
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

function flattenAndDeduplicate(
  pages: readonly { items: SourceDocumentListItemDto[] }[] | undefined
): SourceDocumentListItemDto[] {
  const seen = new Set<string>();
  const result: SourceDocumentListItemDto[] = [];
  for (const page of pages ?? []) {
    for (const doc of page.items) {
      if (seen.has(doc.id)) continue;
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
  minAmount: string | null;
  maxAmount: string | null;
  statusesKey: string | null;
  search: string | null;
}): string {
  const statusParts = params.statusesKey != null ? params.statusesKey.split(",").sort() : [];
  const parts = [
    params.startDate ?? "",
    params.endDate ?? "",
    params.minAmount ?? "",
    params.maxAmount ?? "",
    params.search != null ? encodeURIComponent(params.search) : "",
    ...statusParts,
  ];
  return parts.join("|");
}

function seedRefreshBaseline(
  queryClient: ReturnType<typeof useQueryClient>,
  ledgerId: string,
  page: { generation: string; hasTransitionalWork: boolean }
) {
  const queryKey = queryKeys.sourceDocumentRefresh(ledgerId);
  queryClient.setQueryData<LedgerRefreshResult>(queryKey, (current) => {
    if (current != null && BigInt(current.version) > BigInt(page.generation)) return current;
    return {
      version: page.generation,
      changed: false,
      hasTransitionalWork: page.hasTransitionalWork,
      invalidations: { categories: false, settings: false, stats: false },
    };
  });
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
    mainCurrency,
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
  const generationRef = useRef<string | null>(null);
  const observedRestartFingerprintRef = useRef<string | null>(null);

  const streamQuery = useInfiniteQuery({
    queryKey: streamPageKey,
    queryFn: async ({ pageParam }) => {
      const page = await listStreamPageAction(
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
      );
      seedRefreshBaseline(queryClient, ledgerId, page);
      return page;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } = streamQuery;
  // A new filter window starts fresh: generation/restart state from the
  // previous window must not trigger a background restart for the new key.
  useEffect(() => {
    generationRef.current = null;
    observedRestartFingerprintRef.current = null;
  }, [filterSignature, ledgerId]);

  // Check generation consistency across pages (Fix 3).
  // If a subsequent page has a different generation than the first page,
  // or the server signals restartRequired (invalid cursor / stale data),
  // reset the current window. React Query then fetches a fresh first page.
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
    const fingerprint = pages
      .map((page) => `${page.generation}:${page.restartRequired ? "1" : "0"}`)
      .join("|");
    if (observedRestartFingerprintRef.current === fingerprint) return;
    observedRestartFingerprintRef.current = fingerprint;
    generationRef.current = firstGen;
    void queryClient.resetQueries({ queryKey: streamPageKey, exact: true });
  }, [data, queryClient, streamPageKey]);

  const firstPageAvailable = data?.pages[0] != null;
  const refreshQuery = useLedgerRefreshPolling(ledgerId, enableRefresh && firstPageAvailable);
  const refetchRefresh = refreshQuery.refetch;
  const refresh = useCallback(async (): Promise<{
    changed: boolean;
    result?: StreamRefreshResult;
  }> => {
    const refreshed = await refetchRefresh();
    return {
      changed: refreshed.data?.changed ?? false,
      ...(refreshed.data === undefined ? {} : { result: refreshed.data }),
    };
  }, [refetchRefresh]);

  const items = useMemo(() => flattenAndDeduplicate(data?.pages), [data]);

  // Build unified stream groups (preserving server order)
  const streamGroups: UnifiedStreamGroup[] = useMemo(() => {
    return buildUnifiedStreamGroups(items, mainCurrency);
  }, [items, mainCurrency]);

  return {
    streamGroups,
    isLoading,
    queryKey: streamPageKey,
    queryStatus: streamQuery.status,
    queryIsFetching: streamQuery.isFetching,
    queryHasData: streamQuery.data !== undefined,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError: streamQuery.isFetchNextPageError,
    /** Call the bounded explicit refresh path. */
    refresh,
  };
}
