"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
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
  const { dateRange, minAmount, maxAmount, statuses } = options;

  const startDate = formatDateTimeForApi(dateRange?.start) ?? null;
  const endDate = formatDateTimeForApi(dateRange?.end) ?? null;
  const statusesKey = statuses != null && statuses.length > 0 ? statuses.join(",") : null;

  // Build stream page key that includes all filter params
  const streamPageKey = queryKeys.sourceDocumentStream(ledgerId, {
    startDate,
    endDate,
    ...(minAmount != null ? { minAmount } : {}),
    ...(maxAmount != null ? { maxAmount } : {}),
    statuses: statusesKey,
  });

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
