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
import {
  getDetailsInitialQueryState,
  getStatsInitialQueryState,
} from "@/modules/workspace/initial-query-state";
import type { PeriodParams } from "@/lib/period-utils";
import type { LedgerTab } from "@/modules/workspace/tabs";
import type { LedgerPageBootstrapDto } from "@/modules/workspace/contracts";

export async function getLedgerPageBootstrap(input: {
  ledgerId: string;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
}): Promise<LedgerPageBootstrapDto | null> {
  const queryClient = new QueryClient();
  const ledger = await queryClient.fetchQuery({
    queryKey: queryKeys.ledger(input.ledgerId),
    queryFn: () => getLedgerAction(input.ledgerId),
    staleTime: LEDGER.STALE_TIME_MS,
  });

  if (ledger == null) {
    return null;
  }

  const mainCurrency = ledger.metadata?.settings?.mainCurrency ?? "CNY";
  const initialStatsDate = new Date();
  const detailsState = getDetailsInitialQueryState(input.periodParams);
  const statsState = getStatsInitialQueryState(initialStatsDate);

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.entryCategories(input.ledgerId),
      queryFn: () => getEntryCategoriesAction(input.ledgerId),
      staleTime: LEDGER.STALE_TIME_MS,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgers(),
      queryFn: () => getLedgersAction(),
      staleTime: LEDGER.STALE_TIME_MS,
    }),
    ...(input.initialTab === "stream"
      ? [
          queryClient.prefetchQuery({
            queryKey: queryKeys.sourceDocuments(input.ledgerId, "pending"),
            queryFn: () => getPendingSourceDocumentsAction(input.ledgerId),
            staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS,
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.sourceDocuments(
              input.ledgerId,
              "all",
              detailsState.startDateStr,
              detailsState.endDateStr
            ),
            queryFn: () =>
              getAllSourceDocumentsAction(input.ledgerId, {
                startDate: detailsState.startDateStr ?? undefined,
                endDate: detailsState.endDateStr ?? undefined,
              }),
            staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS,
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.summary(
              input.ledgerId,
              detailsState.startDateStr,
              detailsState.endDateStr,
              mainCurrency,
              null
            ),
            queryFn: () =>
              getLedgerStatsAction(
                input.ledgerId,
                detailsState.startDateStr ?? undefined,
                detailsState.endDateStr ?? undefined,
                mainCurrency
              ),
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
        ]
      : []),
    ...(input.initialTab === "details"
      ? [
          queryClient.prefetchQuery({
            queryKey: queryKeys.summary(
              input.ledgerId,
              detailsState.startDateStr,
              detailsState.endDateStr,
              mainCurrency,
              detailsState.filterKey
            ),
            queryFn: () =>
              getLedgerStatsAction(
                input.ledgerId,
                detailsState.startDateStr ?? undefined,
                detailsState.endDateStr ?? undefined,
                mainCurrency,
                {}
              ),
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
          queryClient.prefetchInfiniteQuery({
            queryKey: queryKeys.ledgerEntries(
              input.ledgerId,
              "infinite",
              detailsState.startDateStr,
              detailsState.endDateStr,
              detailsState.filterKey
            ),
            queryFn: ({ pageParam }) =>
              getLedgerEntriesAction(input.ledgerId, {
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
    ...(input.initialTab === "stats"
      ? [
          queryClient.prefetchQuery({
            queryKey: [
              ...queryKeys.enhancedStats(input.ledgerId),
              statsState.startDateStr,
              statsState.rangeType,
              mainCurrency,
            ],
            queryFn: () =>
              getEnhancedStats({
                ledgerId: input.ledgerId,
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
