"use client";

import { useMemo, useCallback } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSourceDocumentAttentionAction,
  getSourceDocumentsAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import { isRefreshableRevisionState, useRevisionStateRefresh } from "./revision-state-refresh";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTimeForApi } from "@/lib/date-utils";
import {
  groupSourceDocumentsByStatus,
  calculateSourceDocumentStats,
  type GroupedSourceDocuments,
} from "@/modules/source-document/grouping";

export type { SourceDocumentListItemDto as SourceDocumentWithEntries };

const COMPLETED_PAGE_LIMIT = 20;

interface SourceDocumentsStats {
  queuedCount: number;
  processingCount: number;
  anomalyCount: number;
  failedCount: number;
}

export interface UseSourceDocumentCollectionOptions {
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  minAmount?: number;
  maxAmount?: number;
}

function groupAndSummarize(docs: SourceDocumentListItemDto[]): {
  groups: GroupedSourceDocuments<SourceDocumentListItemDto>;
  stats: SourceDocumentsStats;
} {
  const groups = groupSourceDocumentsByStatus(docs);
  const stats = calculateSourceDocumentStats(groups);

  return { groups, stats };
}

export function useSourceDocumentCollection(
  ledgerId: string,
  options: UseSourceDocumentCollectionOptions = {}
) {
  const queryClient = useQueryClient();
  const { dateRange, minAmount, maxAmount } = options;

  const startDate = formatDateTimeForApi(dateRange?.start) ?? null;
  const endDate = formatDateTimeForApi(dateRange?.end) ?? null;

  // 1. Attention query — bounded, independent of date/amount filters
  const {
    data: attentionData,
    isLoading: attentionLoading,
  } = useQuery({
    queryKey: queryKeys.sourceDocumentAttention(ledgerId),
    queryFn: () => getSourceDocumentAttentionAction(ledgerId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // 2. Completed history — cursor-based pagination, respects date/amount filters
  const {
    data: completedData,
    isLoading: completedLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.sourceDocumentCompletedPage(ledgerId),
    queryFn: ({ pageParam }) =>
      getSourceDocumentsAction(ledgerId, {
        status: "completed",
        ...(startDate !== null ? { startDate } : {}),
        ...(endDate !== null ? { endDate } : {}),
        ...(minAmount != null ? { minAmount } : {}),
        ...(maxAmount != null ? { maxAmount } : {}),
        cursor: pageParam,
        limit: COMPLETED_PAGE_LIMIT,
        includeEntries: true,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // 3. Merge: attention items first (status priority), then completed items
  const rawData = useMemo(() => {
    const attentionItems = attentionData?.items ?? [];
    const completedPages = completedData?.pages ?? [];
    const completedItems = completedPages.flatMap((page) => page.items);
    return [...attentionItems, ...completedItems];
  }, [attentionData, completedData]);

  // 4. Check if there are refreshable states among attention items
  const attentionItems = attentionData?.items ?? [];
  const hasRefreshableStates = attentionItems.some((doc) =>
    isRefreshableRevisionState(doc.status)
  );

  // 5. Refresh coordinator — uses backoff strategy
  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourceDocumentAttention(ledgerId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourceDocumentCompletedPage(ledgerId),
      }),
    ]);
  }, [queryClient, ledgerId]);

  useRevisionStateRefresh({
    scope: `source-document-collection:${ledgerId}`,
    enabled: true,
    pending: hasRefreshableStates,
    refresh: refreshAll,
  });

  // 6. Group by status for backwards compatibility
  const { groups, stats } = useMemo(() => {
    if (!rawData || rawData.length === 0) {
      return {
        groups: {
          queued: [],
          processing: [],
          anomaly: [],
          failed: [],
          completed: [],
        },
        stats: {
          queuedCount: 0,
          processingCount: 0,
          anomalyCount: 0,
          failedCount: 0,
        },
      };
    }

    return groupAndSummarize(rawData);
  }, [rawData]);

  const isLoading = attentionLoading || completedLoading;

  return {
    groups,
    stats,
    rawData,
    isLoading,
    attentionItems,
    completedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
