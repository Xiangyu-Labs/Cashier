"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getLedgerEntriesAction, getLedgerStatsAction } from "@/modules/ledger/actions";
import { queryKeys } from "@/lib/query-keys";
import { type PeriodParams } from "@/lib/period-utils";
import type { Ledger } from "@/modules/ledger/contracts";
import { QUERY } from "@/lib/constants";
import { getDetailsInitialQueryState } from "./query-state";

export interface UseDetailsTabDataReturn {
  entries: LedgerEntry[];
  summaryData: Awaited<ReturnType<typeof getLedgerStatsAction>> | undefined;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  monthStats: {
    mainTotal: string;
    mainCurrency: string;
    hasMultipleCurrencies: boolean;
    breakdown: { currency: string; total: string; count: number }[];
  };
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

  const { data: summaryData } = useQuery({
    queryKey: queryKeys.summary(ledgerId, startDateStr, endDateStr, mainCurrency, filterKey),
    queryFn: () =>
      getLedgerStatsAction(
        ledgerId,
        startDateStr ?? undefined,
        endDateStr ?? undefined,
        mainCurrency,
        {
          ...(advancedFilters.categoryId !== undefined
            ? { categoryId: advancedFilters.categoryId }
            : {}),
          ...(advancedFilters.currency !== undefined ? { currency: advancedFilters.currency } : {}),
          ...(advancedFilters.minAmount !== undefined
            ? { minAmount: advancedFilters.minAmount }
            : {}),
          ...(advancedFilters.maxAmount !== undefined
            ? { maxAmount: advancedFilters.maxAmount }
            : {}),
        }
      ),
    enabled: true,
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: queryKeys.ledgerEntries(ledgerId, "infinite", startDateStr, endDateStr, filterKey),
    queryFn: ({ pageParam }) =>
      getLedgerEntriesAction(ledgerId, {
        limit: 50,
        ...(startDateStr !== null ? { startDate: startDateStr } : {}),
        ...(endDateStr !== null ? { endDate: endDateStr } : {}),
        ...(advancedFilters.categoryId != null ? { categoryId: advancedFilters.categoryId } : {}),
        ...(advancedFilters.currency != null ? { currency: advancedFilters.currency } : {}),
        ...(advancedFilters.minAmount != null ? { minAmount: advancedFilters.minAmount } : {}),
        ...(advancedFilters.maxAmount != null ? { maxAmount: advancedFilters.maxAmount } : {}),
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });

  const entries = useMemo(() => {
    if (!data?.pages) return [];
    const allItems = data.pages.flatMap((page) => page.items);
    const uniqueMap = new Map<string, LedgerEntry>();
    allItems.forEach((item) => uniqueMap.set(item.id, item));
    return Array.from(uniqueMap.values());
  }, [data]);

  const monthStats = useMemo(() => {
    const totals = summaryData?.totals ?? [];
    const convertedTotal = summaryData?.convertedTotal;
    const mainTotal = convertedTotal?.total ?? "0";
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
