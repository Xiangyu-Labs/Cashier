import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAllSourceDocumentsAction,
  type SourceDocumentWithEntries,
} from "@/modules/source-document/actions";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTimeForApi } from "@/lib/date-utils";
import {
  groupSourceDocumentsByStatus,
  calculateSourceDocumentStats,
  type GroupedSourceDocuments,
} from "@/modules/source-document/grouping";
import { parseAmount } from "@/lib/formatters";

export type { SourceDocumentWithEntries };

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

function calculateTotalAmount(doc: SourceDocumentWithEntries): number {
  if (doc.ledgerEntries == null || doc.ledgerEntries.length === 0) return 0;
  return doc.ledgerEntries.reduce((sum, entry) => {
    const convertedAmount = entry.convertedAmount;
    const amount =
      convertedAmount != null ? parseAmount(convertedAmount) : parseAmount(entry.amount);
    return sum + Math.abs(amount);
  }, 0);
}

function filterAndGroup(
  docs: SourceDocumentWithEntries[],
  minAmount?: number,
  maxAmount?: number
): { groups: GroupedSourceDocuments<SourceDocumentWithEntries>; stats: SourceDocumentsStats } {
  let filtered = docs;
  if (minAmount != null || maxAmount != null) {
    filtered = docs.filter((doc) => {
      const total = calculateTotalAmount(doc);
      if (minAmount != null && total < minAmount) return false;
      if (maxAmount != null && total > maxAmount) return false;
      return true;
    });
  }

  const groups = groupSourceDocumentsByStatus(filtered);
  const stats = calculateSourceDocumentStats(groups);

  return { groups, stats };
}

export function useSourceDocuments(ledgerId: string, options: UseSourceDocumentsOptions = {}) {
  const { dateRange, minAmount, maxAmount } = options;

  const startDate = formatDateTimeForApi(dateRange?.start) ?? null;
  const endDate = formatDateTimeForApi(dateRange?.end) ?? null;

  const startDateForQuery = startDate ?? undefined;
  const endDateForQuery = endDate ?? undefined;

  const { data: response, isLoading } = useQuery({
    queryKey: queryKeys.sourceDocuments(ledgerId, "all", startDate, endDate),
    queryFn: () =>
      getAllSourceDocumentsAction(ledgerId, {
        startDate: startDateForQuery,
        endDate: endDateForQuery,
      }),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.items.some((doc) => doc.status === "queued" || doc.status === "processing")
        ? 3000
        : false;
    },
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

    return filterAndGroup(rawData, minAmount, maxAmount);
  }, [rawData, minAmount, maxAmount]);

  return {
    groups,
    stats,
    rawData,
    isLoading,
  };
}
