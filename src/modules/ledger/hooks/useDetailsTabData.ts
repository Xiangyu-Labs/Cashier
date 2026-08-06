"use client";
import type { LedgerEntry } from "@/modules/ledger/contracts";
import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getLedgerEntriesAction, getLedgerStatsAction } from "@/modules/ledger/actions";
import { type PeriodParams } from "@/lib/period-utils";
import type { Ledger } from "@/modules/ledger/contracts";
import { QUERY } from "@/lib/constants";
import { buildDetailsQueryDescriptor } from "@/modules/workspace/ledger-tab-query-descriptors";

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
  queryKey: readonly unknown[];
  queryStatus: "pending" | "success" | "error";
  queryIsFetching: boolean;
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
    search?: string | null;
  };
  timeZone?: string;
}

export function useDetailsTabData({
  ledgerId,
  ledger,
  periodParams,
  advancedFilters,
  timeZone,
}: UseDetailsTabDataProps): UseDetailsTabDataReturn {
  const mainCurrency = ledger?.settings.mainCurrency ?? "CNY";
  const descriptor = useMemo(
    () =>
      buildDetailsQueryDescriptor({
        ledgerId,
        periodParams,
        advancedFilters,
        ...(timeZone !== undefined ? { timeZone } : {}),
        mainCurrency,
      }),
    [advancedFilters, ledgerId, mainCurrency, periodParams, timeZone]
  );

  const { data: summaryData } = useQuery({
    queryKey: descriptor.summaryQueryKey,
    queryFn: () =>
      getLedgerStatsAction(
        ledgerId,
        descriptor.summaryParams.startDate,
        descriptor.summaryParams.endDate,
        descriptor.summaryParams.mainCurrency,
        descriptor.summaryParams.filters
      ),
    enabled: true,
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });

  const entriesQuery = useInfiniteQuery({
    queryKey: descriptor.entriesQueryKey,
    queryFn: ({ pageParam }) =>
      getLedgerEntriesAction(ledgerId, descriptor.getEntriesInput(pageParam as string | undefined)),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = entriesQuery;

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
    filterKey: descriptor.filterKey,
    startDateStr: descriptor.startDateStr,
    endDateStr: descriptor.endDateStr,
    queryKey: descriptor.entriesQueryKey,
    queryStatus: entriesQuery.status,
    queryIsFetching: entriesQuery.isFetching,
  };
}
