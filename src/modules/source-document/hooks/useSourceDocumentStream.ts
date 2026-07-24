"use client";

import { useMemo, useRef, useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { listStreamPageAction } from "@/modules/source-document/actions";
import type { SourceDocumentListItemDto, SourceDocumentStatusType } from "@/modules/source-document/contracts";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTimeForApi } from "@/lib/date-utils";
import {
  buildUnifiedStreamGroups,
  type UnifiedStreamGroup,
} from "@/modules/source-document/stream-grouping";

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

export function useSourceDocumentStream(
  ledgerId: string,
  options: UseSourceDocumentStreamOptions = {}
) {
  const queryClient = useQueryClient();
  const { dateRange, minAmount, maxAmount, statuses: rawStatuses } = options;

  const startDate = formatDateTimeForApi(dateRange?.start) ?? null;
  const endDate = formatDateTimeForApi(dateRange?.end) ?? null;

  // Normalize statuses: sort and deduplicate for stable cache keys and
  // consistent filter fingerprints (Fix 6).
  const statuses = useMemo(
    () =>
      rawStatuses != null && rawStatuses.length > 0
        ? [...new Set(rawStatuses)].sort()
        : undefined,
    [rawStatuses]
  );
  const statusesKey = statuses != null && statuses.length > 0 ? statuses.join(",") : null;

  // Build stream page key that includes all filter params
  const streamPageKey = queryKeys.sourceDocumentStream(ledgerId, {
    startDate,
    endDate,
    ...(minAmount != null ? { minAmount } : {}),
    ...(maxAmount != null ? { maxAmount } : {}),
    statuses: statusesKey,
  });

  // Track the generation from the first page for cross-page consistency
  const generationRef = useRef<number | null>(null);

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
        ...(statuses != null && statuses.length > 0 ? { statuses } : {}),
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
  useEffect(() => {
    const pages = data?.pages;
    if (!pages || pages.length === 0) return;

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
  };
}
