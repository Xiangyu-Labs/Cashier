"use client";
import { useMemo, useCallback } from "react";
import { formatDateTimeForApi, getDateInTimezone, parseDateString } from "@/lib/date-utils";
import { add as addDecimal } from "@/lib/money/decimal";

export interface DateGroup<T> {
  title: string;
  timestamp: number;
  items: T[];
  total: string;
}

export interface UseDateGroupingOptions<T> {
  /** Items to group */
  items: T[];
  /** Function to extract date string (yyyy-MM-dd) from item */
  getDateStr: (item: T) => string;
  /** Function to extract a decimal amount from an item for total calculation */
  getAmount: (item: T) => string;
  /** Current locale for date formatting */
  locale: string;
  /** Translation function for "today" and "yesterday" */
  t: (key: "today" | "yesterday") => string;
  timeZone?: string;
  preserveOrder?: boolean;
}

export interface UseDateGroupingReturn<T> {
  /** Grouped items by date */
  groupedItems: DateGroup<T>[];
  /** Helper to get date string */
  getDateStr: (item: T) => string;
}

/**
 * Generic hook for grouping items by date with "today"/"yesterday" labels.
 * Used by ledger entries, source documents, and other date-grouped lists.
 */
export function useDateGrouping<T>({
  items,
  getDateStr,
  getAmount,
  locale,
  t,
  timeZone,
  preserveOrder = false,
}: UseDateGroupingOptions<T>): UseDateGroupingReturn<T> {
  const memoizedGetDateStr = useCallback((item: T) => getDateStr(item), [getDateStr]);

  const groupedItems = useMemo(() => {
    const sortedItems = preserveOrder
      ? items
      : [...items].sort((a, b) => {
          const dateA = memoizedGetDateStr(a);
          const dateB = memoizedGetDateStr(b);
          return dateB.localeCompare(dateA);
        });

    const groups: Record<string, DateGroup<T>> = {};

    const zonedToday = getDateInTimezone(timeZone);
    const today = zonedToday != null ? parseDateString(zonedToday) : new Date();
    const todayStr = formatDateTimeForApi(today);
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = formatDateTimeForApi(yesterdayDate);

    sortedItems.forEach((item) => {
      const dateStr = memoizedGetDateStr(item);
      const date = parseDateString(dateStr);
      const sortTimestamp = date.getTime();

      let title = "";
      if (dateStr === todayStr) {
        title = t("today");
      } else if (dateStr === yesterdayStr) {
        title = t("yesterday");
      } else {
        title = date.toLocaleDateString(locale, {
          month: "long",
          day: "numeric",
          weekday: "long",
        });
      }

      const group = groups[dateStr] ?? {
        title,
        timestamp: sortTimestamp,
        items: [],
        total: "0",
      };
      groups[dateStr] = group;

      group.items.push(item);
      group.total = addDecimal(group.total, getAmount(item));
    });

    const grouped = Object.values(groups);
    return preserveOrder ? grouped : grouped.sort((a, b) => b.timestamp - a.timestamp);
  }, [items, locale, t, memoizedGetDateStr, getAmount, timeZone, preserveOrder]);

  return { groupedItems, getDateStr: memoizedGetDateStr };
}
