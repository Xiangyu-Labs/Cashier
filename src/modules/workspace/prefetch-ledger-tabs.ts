"use client";

import type { QueryClient } from "@tanstack/react-query";
import { QUERY } from "@/lib/constants";
import { queryKeys } from "@/lib/query-keys";
import type { PeriodParams } from "@/lib/period-utils";
import type { Ledger } from "@/modules/ledger/contracts";
import type { LedgerAdvancedFilters } from "./initial-query-state";
import { getDateInTimezone, parseDateString } from "@/lib/date-utils";
import {
  buildDetailsQueryDescriptor,
  buildStatsQueryDescriptor,
} from "./ledger-tab-query-descriptors";

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
  const mainCurrency = ledger?.settings.mainCurrency ?? "CNY";
  const descriptor = buildDetailsQueryDescriptor({
    ledgerId,
    periodParams,
    advancedFilters,
    ...(ledger?.settings.timeZone != null ? { timeZone: ledger.settings.timeZone } : {}),
    mainCurrency,
  });

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: descriptor.summaryQueryKey,
      queryFn: () =>
        getLedgerStatsAction(
          ledgerId,
          descriptor.summaryParams.startDate,
          descriptor.summaryParams.endDate,
          descriptor.summaryParams.mainCurrency,
          descriptor.summaryParams.filters
        ),
      staleTime: QUERY.DEFAULT_STALE_TIME_MS,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: descriptor.entriesQueryKey,
      queryFn: ({ pageParam }) =>
        getLedgerEntriesAction(ledgerId, descriptor.getEntriesInput(pageParam)),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage: LedgerEntriesPage) => lastPage.nextCursor,
      staleTime: QUERY.DEFAULT_STALE_TIME_MS,
    }),
  ]);
}

export async function prefetchStatsTabQuery(queryClient: QueryClient, ledgerId: string) {
  const { getEnhancedStats } = await import("@/modules/stats/actions");
  const ledger = queryClient.getQueryData<Ledger>(queryKeys.ledger(ledgerId));
  const mainCurrency = ledger?.settings.mainCurrency ?? "CNY";
  const fixedTimeZone = ledger?.settings.timeZone ?? undefined;
  const zonedToday = getDateInTimezone(fixedTimeZone);
  const descriptor = buildStatsQueryDescriptor({
    ledgerId,
    currentDate: zonedToday != null ? parseDateString(zonedToday) : new Date(),
    mainCurrency,
  });

  await queryClient.prefetchQuery({
    queryKey: descriptor.queryKey,
    queryFn: () => getEnhancedStats(descriptor.input),
    staleTime: QUERY.DEFAULT_STALE_TIME_MS,
  });
}
