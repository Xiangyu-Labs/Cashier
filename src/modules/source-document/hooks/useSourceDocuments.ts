import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllSourceDocumentsAction } from "@/modules/source-document/actions";
import type { SourceDocumentListItemDto as SourceDocumentListItemWithEntries } from "@/modules/source-document/contracts";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTimeForApi } from "@/lib/date-utils";
import {
  groupSourceDocumentsByStatus,
  calculateSourceDocumentStats,
  type GroupedSourceDocuments,
} from "@/modules/source-document/grouping";

export type { SourceDocumentListItemWithEntries as SourceDocumentWithEntries };

interface SourceDocumentsStats {
  queuedCount: number;
  processingCount: number;
  anomalyCount: number;
  failedCount: number;
}

export interface UseSourceDocumentsOptions {
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  minAmount?: number;
  maxAmount?: number;
}

function groupAndSummarize(
  docs: SourceDocumentListItemWithEntries[]
): {
  groups: GroupedSourceDocuments<SourceDocumentListItemWithEntries>;
  stats: SourceDocumentsStats;
} {
  const groups = groupSourceDocumentsByStatus(docs);
  const stats = calculateSourceDocumentStats(groups);

  return { groups, stats };
}

export function useSourceDocuments(ledgerId: string, options: UseSourceDocumentsOptions = {}) {
  const { dateRange, minAmount, maxAmount } = options;

  const startDate = formatDateTimeForApi(dateRange?.start) ?? null;
  const endDate = formatDateTimeForApi(dateRange?.end) ?? null;
  const processingPolling = useSmartPolling<{ items: SourceDocumentListItemWithEntries[] }>({
    isPollingActive: useCallback(
      (data) =>
        data?.items.some((doc) => doc.status === "queued" || doc.status === "processing") ?? false,
      []
    ),
  });

  const { data: response, isLoading } = useQuery({
    queryKey: queryKeys.sourceDocumentsAll(ledgerId, {
      startDate,
      endDate,
      ...(minAmount != null ? { minAmount } : {}),
      ...(maxAmount != null ? { maxAmount } : {}),
    }),
    queryFn: () =>
      getAllSourceDocumentsAction(ledgerId, {
        ...(startDate !== null ? { startDate } : {}),
        ...(endDate !== null ? { endDate } : {}),
        ...(minAmount != null ? { minAmount } : {}),
        ...(maxAmount != null ? { maxAmount } : {}),
      }),
    refetchInterval: processingPolling,
  });

  const rawData = response?.items;

  const { groups, stats } = useMemo(() => {
    if (!rawData) {
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

  return {
    groups,
    stats,
    rawData,
    isLoading,
  };
}
