import { after } from "next/server";
import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { runtimeEnv } from "@/lib/env/runtime";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER, QUERY } from "@/lib/constants";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import { listEntryCategories } from "@/modules/ledger/application/queries/list-entry-categories";
import { listLedgerEntries } from "@/modules/ledger/application/queries/list-ledger-entries";
import { getEnhancedStats } from "@/modules/stats/application/queries/get-enhanced-stats";
import { getSourceDocumentCountsQuery } from "@/modules/source-document/application/queries/get-source-document-counts";
import { listStreamPage } from "@/modules/source-document/application/queries/list-stream-page";
import type { StreamPage } from "@/modules/source-document/contracts";
import { requireLedgerAccess } from "@/modules/ledger/access";
import {
  type LedgerAdvancedFilters,
  getDetailsInitialQueryState,
  getStatsInitialQueryState,
} from "@/modules/workspace/initial-query-state";
import type { PeriodParams } from "@/lib/period-utils";
import type { LedgerDto } from "@/modules/ledger/contracts";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { scheduleProcessingRecovery } from "@/modules/source-document/server-actions/schedule-processing-recovery";

interface LedgerPageBootstrapResult {
  dehydratedState: DehydratedState;
  initialStatsDate: Date;
}

export interface GetLedgerPageBootstrapInput {
  ledgerId: string;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
  advancedFilters?: LedgerAdvancedFilters;
  /** Optional pre-authorized ledger DTO to skip re-authorization. */
  ledgerDto?: LedgerDto;
}

export async function getLedgerPageBootstrap(
  input: GetLedgerPageBootstrapInput
): Promise<LedgerPageBootstrapResult | null> {
  let ledgerDto: LedgerDto;

  if (input.ledgerDto != null) {
    // Use pre-authorized DTO — skip re-authorization
    ledgerDto = input.ledgerDto;
  } else {
    // Legacy path: authorize inline
    try {
      const { ledger } = await requireLedgerAccess(input.ledgerId);
      ledgerDto = {
        id: ledger.id,
        userId: ledger.userId,
        metadata: { settings: ledger.settings },
        createdAt: ledger.createdAt,
        updatedAt: ledger.updatedAt,
        deletedAt: null,
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        return null;
      }
      throw error;
    }
  }

  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.ledger(input.ledgerId), ledgerDto);

  const mainCurrency = ledgerDto.metadata?.settings?.mainCurrency ?? "CNY";
  const initialStatsDate = new Date();
  const detailsState = getDetailsInitialQueryState(input.periodParams, input.advancedFilters);
  const statsState = getStatsInitialQueryState(initialStatsDate);

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.entryCategories(input.ledgerId),
      queryFn: () => listEntryCategories(input.ledgerId),
      staleTime: LEDGER.STALE_TIME_MS,
    }),
    ...(input.initialTab === "stream"
      ? [
          // Counts (lightweight aggregation, unfiltered)
          queryClient.prefetchQuery({
            queryKey: queryKeys.sourceDocumentCounts(input.ledgerId),
            queryFn: () => getSourceDocumentCountsQuery(input.ledgerId),
            staleTime: runtimeEnv.sourceDocStaleTimeMs,
          }),
          // First stream page (all-statuses, filtered by period+amount, paginated)
          queryClient.prefetchInfiniteQuery({
            queryKey: queryKeys.sourceDocumentStream(input.ledgerId, {
              startDate: detailsState.startDateStr,
              endDate: detailsState.endDateStr,
              minAmount: input.advancedFilters?.minAmount,
              maxAmount: input.advancedFilters?.maxAmount,
              statuses: input.advancedFilters?.statuses?.join?.(',') ??
                (input.advancedFilters?.statuses != null
                  ? (input.advancedFilters.statuses as string[]).join(',')
                  : null),
            }),
            queryFn: ({ pageParam }) =>
              listStreamPage(input.ledgerId, {
                ...(detailsState.startDateStr !== null
                  ? { startDate: detailsState.startDateStr }
                  : {}),
                ...(detailsState.endDateStr !== null
                  ? { endDate: detailsState.endDateStr }
                  : {}),
                ...(input.advancedFilters?.minAmount != null
                  ? { minAmount: input.advancedFilters.minAmount }
                  : {}),
                ...(input.advancedFilters?.maxAmount != null
                  ? { maxAmount: input.advancedFilters.maxAmount }
                  : {}),
                ...(input.advancedFilters?.statuses != null
                  ? { statuses: input.advancedFilters.statuses }
                  : {}),
                cursor: pageParam as string | undefined,
                limit: 20,
              }),
            initialPageParam: undefined as string | undefined,
            getNextPageParam: (lastPage: StreamPage) => lastPage.nextCursor,
            staleTime: runtimeEnv.sourceDocStaleTimeMs,
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
              calculateLedgerStats(
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
              calculateLedgerStats(
                input.ledgerId,
                detailsState.startDateStr ?? undefined,
                detailsState.endDateStr ?? undefined,
                mainCurrency,
                input.advancedFilters
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
              listLedgerEntries(input.ledgerId, {
                ...(detailsState.startDateStr !== null
                  ? { startDate: detailsState.startDateStr }
                  : {}),
                ...(detailsState.endDateStr !== null ? { endDate: detailsState.endDateStr } : {}),
                ...(input.advancedFilters?.categoryId != null
                  ? { categoryId: input.advancedFilters.categoryId }
                  : {}),
                ...(input.advancedFilters?.currency != null
                  ? { currency: input.advancedFilters.currency }
                  : {}),
                ...(input.advancedFilters?.minAmount != null
                  ? { minAmount: input.advancedFilters.minAmount }
                  : {}),
                ...(input.advancedFilters?.maxAmount != null
                  ? { maxAmount: input.advancedFilters.maxAmount }
                  : {}),
                cursor: pageParam,
                limit: 50,
              }),
            initialPageParam: undefined as string | undefined,
            getNextPageParam: (lastPage: Awaited<ReturnType<typeof listLedgerEntries>>) =>
              lastPage.nextCursor,
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
        ]
      : []),
    ...(input.initialTab === "stats"
      ? [
          queryClient.prefetchQuery({
            queryKey: queryKeys.enhancedStats(input.ledgerId, {
              startDate: statsState.startDateStr,
              rangeType: statsState.rangeType,
              mainCurrency,
            }),
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

  // Schedule recovery of any missed processing intents after the response is sent
  after(() => scheduleProcessingRecovery(input.ledgerId));

  return {
    dehydratedState: dehydrate(queryClient),
    initialStatsDate,
  };
}
