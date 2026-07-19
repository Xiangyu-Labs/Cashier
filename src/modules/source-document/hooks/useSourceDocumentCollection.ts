"use client";

import { useMemo, useCallback } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSourceDocumentAttentionAction,
  getSourceDocumentsAction,
} from "@/modules/source-document/actions";
import type { SourceDocumentListItemDto } from "@/modules/source-document/contracts";
import type { SourceDocumentStatusType } from "@/modules/source-document/types";
import { isRefreshableRevisionState, useRevisionStateRefresh } from "./revision-state-refresh";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTimeForApi } from "@/lib/date-utils";
import {
  groupSourceDocumentsByStatus,
  calculateSourceDocumentStats,
  type GroupedSourceDocuments,
} from "@/modules/source-document/grouping";
import {
  buildUnifiedStreamGroups,
  type UnifiedStreamGroup,
} from "@/modules/source-document/stream-grouping";

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
  /** Canonical selected statuses. Empty/undefined means all statuses. */
  statuses?: SourceDocumentStatusType[];
}

function groupAndSummarize(docs: SourceDocumentListItemDto[]): {
  groups: GroupedSourceDocuments<SourceDocumentListItemDto>;
  stats: SourceDocumentsStats;
} {
  const groups = groupSourceDocumentsByStatus(docs);
  const stats = calculateSourceDocumentStats(groups);

  return { groups, stats };
}

/**
 * Deduplicate a merged list of source documents by id.
 * Items earlier in the array (attention items) take priority.
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

export function useSourceDocumentCollection(
  ledgerId: string,
  options: UseSourceDocumentCollectionOptions = {}
) {
  const queryClient = useQueryClient();
  const { dateRange, minAmount, maxAmount, statuses } = options;

  const startDate = formatDateTimeForApi(dateRange?.start) ?? null;
  const endDate = formatDateTimeForApi(dateRange?.end) ?? null;

  // Build completed page key that includes filter params (C1)
  const completedPageKey = queryKeys.sourceDocumentCompletedPage(ledgerId, {
    startDate,
    endDate,
    minAmount,
    maxAmount,
  });

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
    queryKey: completedPageKey,
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

  // 3. Merge: attention items first (status priority), then completed items, deduplicated (I6)
  const rawData = useMemo(() => {
    const attentionItems = attentionData?.items ?? [];
    const completedPages = completedData?.pages ?? [];
    const completedItems = completedPages.flatMap((page) => page.items);
    return deduplicate([...attentionItems, ...completedItems]);
  }, [attentionData, completedData]);

  // 4. Check if there are refreshable states among attention items
  const attentionItems = attentionData?.items ?? [];
  const hasRefreshableStates = attentionItems.some((doc) =>
    isRefreshableRevisionState(doc.status)
  );

  // 5. Refresh coordinator — uses backoff strategy (I9: add counts invalidation)
  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourceDocumentAttention(ledgerId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["sourceDocuments", ledgerId, "completed", "page"],
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.sourceDocumentCounts(ledgerId),
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
          candidate_pending: [],
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

  // 7. Unified stream groups (Task 2/3: replaces status-bucket grouping)
  const streamGroups: UnifiedStreamGroup[] = useMemo(() => {
    const attentionItemsData = attentionData?.items ?? [];
    const completedPagesData = completedData?.pages ?? [];
    const completedItemsData = completedPagesData.flatMap((page) => page.items);
    return buildUnifiedStreamGroups(attentionItemsData, completedItemsData, {
      startDate,
      endDate,
      ...(minAmount != null ? { minAmount } : {}),
      ...(maxAmount != null ? { maxAmount } : {}),
      ...(statuses != null && statuses.length > 0 ? { statuses } : {}),
    });
  }, [attentionData, completedData, startDate, endDate, minAmount, maxAmount, statuses]);

  const isLoading = attentionLoading || completedLoading;

  return {
    groups,
    stats,
    streamGroups,
    rawData,
    isLoading,
    attentionItems,
    completedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
