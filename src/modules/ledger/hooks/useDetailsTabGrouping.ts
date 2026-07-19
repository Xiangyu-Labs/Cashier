"use client";
import { useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { parseAmount } from "@/lib/formatters";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { useDateGrouping } from "@/hooks/use-date-grouping";

export interface GroupedEntry {
  title: string;
  timestamp: number;
  items: LedgerEntry[];
  total: number;
}

export interface UseDetailsTabGroupingReturn {
  groupedItems: GroupedEntry[];
  getDateStr: (entry: LedgerEntry) => string;
}

export function useDetailsTabGrouping(entries: LedgerEntry[]): UseDetailsTabGroupingReturn {
  const t = useTranslations("DetailsTab");
  const locale = useLocale();

  const getDateStr = useCallback((entry: LedgerEntry) => {
    if (entry.sourceDocument?.entryDate != null && entry.sourceDocument.entryDate !== "") {
      return entry.sourceDocument.entryDate;
    }
    return formatDateTimeForApi(new Date(entry.createdAt)) ?? formatDateTimeForApi(new Date())!;
  }, []);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (a.createdAt !== b.createdAt) {
          return b.createdAt.localeCompare(a.createdAt);
        }
        return b.id.localeCompare(a.id);
      }),
    [entries]
  );

  const { groupedItems } = useDateGrouping({
    items: sortedEntries,
    getDateStr,
    getAmount: (entry) =>
      entry.convertedAmount != null
        ? parseAmount(entry.convertedAmount)
        : parseAmount(entry.amount),
    locale,
    t,
  });

  return { groupedItems, getDateStr };
}
