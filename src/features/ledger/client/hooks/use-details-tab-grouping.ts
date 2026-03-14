"use client";

import { useMemo, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LedgerEntry } from "@/types/api";
import { parseAmount } from "@/lib/formatters";

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

export function useDetailsTabGrouping(
  entries: LedgerEntry[],
): UseDetailsTabGroupingReturn {
  const t = useTranslations("DetailsTab");
  const locale = useLocale();

  const getDateStr = useCallback((entry: LedgerEntry) => {
    if (entry.sourceDocument?.entryDate) return entry.sourceDocument.entryDate;
    return new Date(entry.createdAt).toLocaleDateString("sv");
  }, []);

  const groupedItems = useMemo(() => {
    const sortedEntries = [...entries].sort((a, b) => {
      const dateA = getDateStr(a);
      const dateB = getDateStr(b);
      return dateB.localeCompare(dateA);
    });

    const groups: Record<string, GroupedEntry> = {};

    const todayStr = new Date().toLocaleDateString("sv");
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toLocaleDateString("sv");

    sortedEntries.forEach((entry) => {
      const dateStr = getDateStr(entry);
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      const sortTimestamp = date.getTime();

      let dateKey = "";
      if (dateStr === todayStr) {
        dateKey = t("today");
      } else if (dateStr === yesterdayStr) {
        dateKey = t("yesterday");
      } else {
        dateKey = date.toLocaleDateString(locale, {
          month: "long",
          day: "numeric",
          weekday: "long",
        });
      }

      if (!groups[dateKey]) {
        groups[dateKey] = {
          title: dateKey,
          timestamp: sortTimestamp,
          items: [],
          total: 0,
        };
      }

      groups[dateKey].items.push(entry);
      groups[dateKey].total += entry.convertedAmount
        ? parseAmount(entry.convertedAmount)
        : parseAmount(entry.amount);
    });

    return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
  }, [entries, locale, t, getDateStr]);

  return { groupedItems, getDateStr };
}
