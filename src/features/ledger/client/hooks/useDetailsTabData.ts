"use client";

import { useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { queryKeys } from "@/lib/query-keys";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { periodToDateRange, type PeriodParams } from "@/lib/period-utils";
import type { Ledger, LedgerEntry } from "@/types/api";
import type { EntryFilters } from "../../components/EntryFilterPanel";

export interface UseDetailsTabDataReturn {
  // Data
  entries: LedgerEntry[];
  summaryData: Awaited<ReturnType<typeof getLedgerStatsAction>> | undefined;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;

  // Stats
  monthStats: {
    mainTotal: number;
    mainCurrency: string;
    hasMultipleCurrencies: boolean;
    breakdown: { currency: string; amount: number }[];
  };

  // Filter key for query caching
  filterKey: string | null;
  startDateStr: string | null;
  endDateStr: string | null;
}

interface UseDetailsTabDataProps {
  ledgerId: string;
  ledger?: Ledger;
  periodParams: PeriodParams;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
  };
}

export function useDetailsTabData({
  ledgerId,
  ledger,
  periodParams,
  advancedFilters,
}: UseDetailsTabDataProps): UseDetailsTabDataReturn {
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency || "CNY";

  // Convert periodParams to date range
  const dateRange = useMemo(
    () => periodToDateRange(periodParams),
    [periodParams]
  );

  // Combine period-based dates with advanced filters
  const filters: EntryFilters = useMemo(
    () => ({
      startDate: dateRange.startDate ? new Date(dateRange.startDate) : undefined,
      endDate: dateRange.endDate ? new Date(dateRange.endDate) : undefined,
      ...advancedFilters,
    }),
    [dateRange, advancedFilters]
  );

  const startDateStr = formatDateTimeForApi(filters.startDate) ?? null;
  const endDateStr = formatDateTimeForApi(filters.endDate) ?? null;

  // Build filter key for queryKey
  const filterKey = useMemo(() => {
    const parts: string[] = [];
    if (filters.categoryId) parts.push(`cat:${filters.categoryId}`);
    if (filters.currency) parts.push(`cur:${filters.currency}`);
    if (filters.minAmount !== undefined && filters.minAmount !== null)
      parts.push(`min:${filters.minAmount}`);
    if (filters.maxAmount !== undefined && filters.maxAmount !== null)
      parts.push(`max:${filters.maxAmount}`);
    return parts.length > 0 ? parts.join("|") : null;
  }, [filters.categoryId, filters.currency, filters.minAmount, filters.maxAmount]);

  // Summary query
  const { data: summaryData } = useQuery({
    queryKey: queryKeys.ledgerEntries(
      ledgerId,
      "summary",
      startDateStr,
      endDateStr,
      mainCurrency,
      filterKey
    ),
    queryFn: () =>
      getLedgerStatsAction(ledgerId, startDateStr || undefined, endDateStr || undefined, mainCurrency, {
        categoryId: filters.categoryId,
        currency: filters.currency,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
      }),
    enabled: true,
  });

  // Infinite query for entries
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: queryKeys.ledgerEntries(ledgerId, "infinite", startDateStr, endDateStr, filterKey),
    queryFn: ({ pageParam }) =>
      getLedgerEntriesAction(ledgerId, {
        startDate: startDateStr || undefined,
        endDate: endDateStr || undefined,
        categoryId: filters.categoryId,
        currency: filters.currency,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        cursor: pageParam,
        limit: 50,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    placeholderData: (previousData) => previousData,
  });

  // Flatten entries
  const entries = useMemo(() => {
    if (!data?.pages) return [];
    const allItems = data.pages.flatMap((page) => page.items);
    const uniqueMap = new Map<string, LedgerEntry>();
    allItems.forEach((item) => uniqueMap.set(item.id, item));
    return Array.from(uniqueMap.values());
  }, [data]);

  // Calculate stats
  const monthStats = useMemo(() => {
    const totals = summaryData?.totals || [];
    const convertedTotal = summaryData?.convertedTotal;
    const mainTotal = convertedTotal?.total || 0;
    const hasMultipleCurrencies = totals.length > 1;

    return {
      mainTotal,
      mainCurrency: convertedTotal?.currency || mainCurrency,
      hasMultipleCurrencies,
      breakdown: totals,
    };
  }, [summaryData, mainCurrency]);

  return {
    entries,
    summaryData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    monthStats,
    filterKey,
    startDateStr,
    endDateStr,
  };
}
