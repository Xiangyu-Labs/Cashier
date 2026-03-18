"use client";

import { useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { getLedgerEntriesAction, getLedgerStatsAction } from "@/modules/ledger/actions";
import { queryKeys } from "@/lib/query-keys";
import { type PeriodParams } from "@/lib/period-utils";
import type { Ledger, LedgerEntry } from "@/types/api";
import { QUERY } from "@/lib/constants";
import { getDetailsInitialQueryState } from "@/features/ledger/lib/initial-query-state";

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
    breakdown: { currency: string; total: number; count: number }[];
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
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const { startDateStr, endDateStr, filterKey } = useMemo(
    () => getDetailsInitialQueryState(periodParams, advancedFilters),
    [periodParams, advancedFilters]
  );

  // Summary query (query key 不包含 filterKey，与预加载保持一致)
  const { data: summaryData } = useQuery({
    queryKey: queryKeys.summary(ledgerId, startDateStr, endDateStr, mainCurrency, filterKey),
    queryFn: () =>
      getLedgerStatsAction(
        ledgerId,
        startDateStr ?? undefined,
        endDateStr ?? undefined,
        mainCurrency,
        {
          categoryId: advancedFilters.categoryId,
          currency: advancedFilters.currency,
          minAmount: advancedFilters.minAmount,
          maxAmount: advancedFilters.maxAmount,
        }
      ),
    enabled: true,
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });

  // Infinite query for entries (query key 不包含 filterKey，与预加载保持一致)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: queryKeys.ledgerEntries(ledgerId, "infinite", startDateStr, endDateStr, filterKey),
    queryFn: ({ pageParam }) =>
      getLedgerEntriesAction(ledgerId, {
        startDate: startDateStr ?? undefined,
        endDate: endDateStr ?? undefined,
        categoryId: advancedFilters.categoryId,
        currency: advancedFilters.currency,
        minAmount: advancedFilters.minAmount,
        maxAmount: advancedFilters.maxAmount,
        cursor: pageParam,
        limit: 50,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
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
    const totals = summaryData?.totals ?? [];
    const convertedTotal = summaryData?.convertedTotal;
    const mainTotal = convertedTotal?.total ?? 0;
    const hasMultipleCurrencies = totals.length > 1;

    return {
      mainTotal,
      mainCurrency: convertedTotal?.currency ?? mainCurrency,
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
