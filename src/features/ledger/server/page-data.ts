import { QueryClient, dehydrate } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER, QUERY } from "@/lib/constants";
import {
  getLedgerAction,
  getLedgersAction,
  getEntryCategoriesAction,
  getLedgerStatsAction,
  getLedgerEntriesAction,
} from "@/modules/ledger";
import { getEnhancedStats } from "@/modules/stats";
import {
  getPendingSourceDocumentsAction,
  getAllSourceDocumentsAction,
} from "@/modules/source-document";
import { getDetailsInitialQueryState, getStatsInitialQueryState } from "@/features/ledger/lib/initial-query-state";
import type { PeriodParams } from "@/lib/period-utils";
import type { LedgerTab } from "@/features/ledger/lib/tabs";

interface PrepareLedgerPageDataOptions {
  ledgerId: string;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
}

export async function prepareLedgerPageData({
  ledgerId,
  initialTab,
  periodParams,
}: PrepareLedgerPageDataOptions) {
  const queryClient = new QueryClient();
  const ledger = await queryClient.fetchQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: LEDGER.STALE_TIME_MS,
  });

  if (ledger == null) {
    return null;
  }

  const mainCurrency = ledger.metadata?.settings?.mainCurrency ?? "CNY";
  const initialStatsDate = new Date();
  const detailsState = getDetailsInitialQueryState(periodParams);
  const statsState = getStatsInitialQueryState(initialStatsDate);

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.entryCategories(ledgerId),
      queryFn: () => getEntryCategoriesAction(ledgerId),
      staleTime: LEDGER.STALE_TIME_MS,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgers(),
      queryFn: () => getLedgersAction(),
      staleTime: LEDGER.STALE_TIME_MS,
    }),
    ...(initialTab === "stream"
      ? [
          queryClient.prefetchQuery({
            queryKey: queryKeys.sourceDocuments(ledgerId, "pending"),
            queryFn: () => getPendingSourceDocumentsAction(ledgerId),
            staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS,
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.sourceDocuments(
              ledgerId,
              "all",
              detailsState.startDateStr,
              detailsState.endDateStr
            ),
            queryFn: () =>
              getAllSourceDocumentsAction(ledgerId, {
                startDate: detailsState.startDateStr ?? undefined,
                endDate: detailsState.endDateStr ?? undefined,
              }),
            staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS,
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.summary(
              ledgerId,
              detailsState.startDateStr,
              detailsState.endDateStr,
              mainCurrency,
              null
            ),
            queryFn: () =>
              getLedgerStatsAction(
                ledgerId,
                detailsState.startDateStr ?? undefined,
                detailsState.endDateStr ?? undefined,
                mainCurrency
              ),
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
        ]
      : []),
    ...(initialTab === "details"
      ? [
          queryClient.prefetchQuery({
            queryKey: queryKeys.summary(
              ledgerId,
              detailsState.startDateStr,
              detailsState.endDateStr,
              mainCurrency,
              detailsState.filterKey
            ),
            queryFn: () =>
              getLedgerStatsAction(
                ledgerId,
                detailsState.startDateStr ?? undefined,
                detailsState.endDateStr ?? undefined,
                mainCurrency,
                {}
              ),
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
          queryClient.prefetchInfiniteQuery({
            queryKey: queryKeys.ledgerEntries(
              ledgerId,
              "infinite",
              detailsState.startDateStr,
              detailsState.endDateStr,
              detailsState.filterKey
            ),
            queryFn: ({ pageParam }) =>
              getLedgerEntriesAction(ledgerId, {
                startDate: detailsState.startDateStr ?? undefined,
                endDate: detailsState.endDateStr ?? undefined,
                cursor: pageParam,
                limit: 50,
              }),
            initialPageParam: undefined as string | undefined,
            getNextPageParam: (lastPage: Awaited<ReturnType<typeof getLedgerEntriesAction>>) =>
              lastPage.nextCursor,
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
        ]
      : []),
    ...(initialTab === "stats"
      ? [
          queryClient.prefetchQuery({
            queryKey: [
              ...queryKeys.enhancedStats(ledgerId),
              statsState.startDateStr,
              statsState.rangeType,
              mainCurrency,
            ],
            queryFn: () =>
              getEnhancedStats({
                ledgerId,
                queryRange: {
                  from: statsState.startDateStr,
                  to: statsState.endDateStr,
                },
                compareRange: {
                  from: statsState.prevDateStartStr,
                  to: statsState.prevDateEndStr,
                },
              }),
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
        ]
      : []),
  ]);

  return {
    dehydratedState: dehydrate(queryClient),
    initialStatsDate,
  };
}
