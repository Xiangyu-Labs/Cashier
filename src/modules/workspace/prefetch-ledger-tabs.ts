"use client";

import type { QueryClient } from "@tanstack/react-query";
import { QUERY } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import type { PeriodParams } from "@/lib/period-utils";
import type { Ledger } from "@/modules/ledger/contracts";
import type { LedgerAdvancedFilters } from "./initial-query-state";
import { getDetailsInitialQueryState, getStatsInitialQueryState } from "./initial-query-state";

type LedgerEntriesPage = Awaited<
  ReturnType<(typeof import("@/modules/ledger/actions"))["getLedgerEntriesAction"]>
>;

export async function prefetchDetailsTabQuery(
  queryClient: QueryClient,
  ledgerId: string,
  periodParams: PeriodParams,
  advancedFilters: LedgerAdvancedFilters
) {
  const { getLedgerEntriesAction, getLedgerStatsAction } = await import("@/modules/ledger/actions");
  const ledger = queryClient.getQueryData<Ledger>(queryKeys.ledger(ledgerId));
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const { startDateStr, endDateStr, filterKey } = getDetailsInitialQueryState(
    periodParams,
    advancedFilters
  );

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.summary(ledgerId, startDateStr, endDateStr, mainCurrency, filterKey),
      queryFn: () =>
        getLedgerStatsAction(
          ledgerId,
          startDateStr ?? undefined,
          endDateStr ?? undefined,
          mainCurrency,
          advancedFilters
        ),
      staleTime: QUERY.DEFAULT_STALE_TIME_MS,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.ledgerEntries(ledgerId, "infinite", startDateStr, endDateStr, filterKey),
      queryFn: ({ pageParam }) =>
        getLedgerEntriesAction(ledgerId, {
          limit: 50,
          ...(startDateStr != null ? { startDate: startDateStr } : {}),
          ...(endDateStr != null ? { endDate: endDateStr } : {}),
          ...(advancedFilters.categoryId != null ? { categoryId: advancedFilters.categoryId } : {}),
          ...(advancedFilters.currency != null ? { currency: advancedFilters.currency } : {}),
          ...(advancedFilters.minAmount != null ? { minAmount: advancedFilters.minAmount } : {}),
          ...(advancedFilters.maxAmount != null ? { maxAmount: advancedFilters.maxAmount } : {}),
          ...(pageParam != null ? { cursor: pageParam as string } : {}),
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage: LedgerEntriesPage) => lastPage.nextCursor,
      staleTime: QUERY.DEFAULT_STALE_TIME_MS,
    }),
  ]);
}

export async function prefetchStatsTabQuery(queryClient: QueryClient, ledgerId: string) {
  const { getEnhancedStats } = await import("@/modules/stats/actions");
  const ledger = queryClient.getQueryData<Ledger>(queryKeys.ledger(ledgerId));
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency ?? "CNY";
  const state = getStatsInitialQueryState(new Date());

  await queryClient.prefetchQuery({
    queryKey: queryKeys.enhancedStats(ledgerId, {
      startDate: state.startDateStr,
      rangeType: state.rangeType,
      mainCurrency,
    }),
    queryFn: () =>
      getEnhancedStats({
        ledgerId,
        queryRange: { from: state.startDateStr, to: state.endDateStr },
        compareRange: { from: state.prevDateStartStr, to: state.prevDateEndStr },
      }),
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });
}
