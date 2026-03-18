import { useMemo, useCallback } from "react";
import type { SourceDocumentGroup } from "@/lib/serialization";
import { parseAmount } from "@/lib/formatters";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { useDateGrouping } from "@/hooks/use-date-grouping";

interface UseGroupedEntriesOptions {
  completedGroups: SourceDocumentGroup[];
  locale: string;
  _mainCurrency?: string;
  tDetails: (key: string) => string;
}

export function useGroupedEntries({
  completedGroups,
  locale,
  _mainCurrency = "CNY",
  tDetails,
}: UseGroupedEntriesOptions) {
  const getSourceDocDateStr = useCallback((group: SourceDocumentGroup): string => {
    if (group.sourceDocument.entryDate != null && group.sourceDocument.entryDate !== "") {
      return group.sourceDocument.entryDate;
    }
    const createdAt = group.sourceDocument.createdAt;
    if (createdAt != null && createdAt !== "") {
      return formatDateTimeForApi(new Date(createdAt)) ?? formatDateTimeForApi(new Date())!;
    }
    return formatDateTimeForApi(new Date())!;
  }, []);

  const { groupedItems: groupedCompletedByDate } = useDateGrouping({
    items: completedGroups,
    getDateStr: getSourceDocDateStr,
    getAmount: (group) =>
      group.ledgerEntries.reduce((sum, entry) => {
        const amount =
          entry.convertedAmount != null && entry.convertedAmount !== ""
            ? parseAmount(entry.convertedAmount)
            : parseAmount(entry.amount);
        return sum + amount;
      }, 0),
    locale,
    t: (key) => tDetails(key),
  });

  const allSourceDocumentIds = useMemo(() => {
    return groupedCompletedByDate.flatMap((group) =>
      group.items.map((item) => item.sourceDocument.id)
    );
  }, [groupedCompletedByDate]);

  return {
    groupedCompletedByDate,
    allSourceDocumentIds,
  };
}
