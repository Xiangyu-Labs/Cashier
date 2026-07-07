import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER, QUERY } from "@/lib/constants";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import { getLedgers } from "@/modules/ledger/application/queries/list-ledgers";
import { listEntryCategories } from "@/modules/ledger/application/queries/list-entry-categories";
import { listLedgerEntries } from "@/modules/ledger/application/queries/list-ledger-entries";
import { getEnhancedStats } from "@/modules/stats/application/queries/get-enhanced-stats";
import { getPendingSourceDocuments } from "@/modules/source-document/application/queries/get-pending-source-documents";
import { getSourceDocumentCollection } from "@/modules/source-document/application/queries/list-source-document-collection";
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

interface LedgerPageBootstrapResult {
  dehydratedState: DehydratedState;
  initialStatsDate: Date;
}

const STREAM_COLLECTION_LIMIT = 1000;

export async function getLedgerPageBootstrap(input: {
  ledgerId: string;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
  advancedFilters?: LedgerAdvancedFilters;
}): Promise<LedgerPageBootstrapResult | null> {
  let userId: string;
  let ledgerDto: LedgerDto;

  try {
    const { userId: authorizedUserId, ledger } = await requireLedgerAccess(input.ledgerId);
    userId = authorizedUserId;
    ledgerDto = {
      id: ledger.id,
      userId: ledger.userId,
      metadata: ledger.metadata,
      createdAt: ledger.createdAt.toISOString(),
      updatedAt: ledger.updatedAt.toISOString(),
      deletedAt: ledger.deletedAt?.toISOString() ?? null,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
      return null;
    }
    throw error;
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
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgers(),
      queryFn: () => getLedgers(userId),
      staleTime: LEDGER.STALE_TIME_MS,
    }),
    ...(input.initialTab === "stream"
      ? [
          queryClient.prefetchQuery({
            queryKey: queryKeys.sourceDocuments(input.ledgerId, "pending"),
            queryFn: () => getPendingSourceDocuments(input.ledgerId),
            staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS,
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.sourceDocumentCollection(input.ledgerId, {
              startDate: detailsState.startDateStr,
              endDate: detailsState.endDateStr,
              ...(input.advancedFilters?.minAmount != null
                ? { minAmount: input.advancedFilters.minAmount }
                : {}),
              ...(input.advancedFilters?.maxAmount != null
                ? { maxAmount: input.advancedFilters.maxAmount }
                : {}),
              limit: STREAM_COLLECTION_LIMIT,
            }),
            queryFn: () =>
              getSourceDocumentCollection(input.ledgerId, {
                ...(detailsState.startDateStr !== null
                  ? { startDate: detailsState.startDateStr }
                  : {}),
                ...(detailsState.endDateStr !== null ? { endDate: detailsState.endDateStr } : {}),
                ...(input.advancedFilters?.minAmount != null
                  ? { minAmount: input.advancedFilters.minAmount }
                  : {}),
                ...(input.advancedFilters?.maxAmount != null
                  ? { maxAmount: input.advancedFilters.maxAmount }
                  : {}),
                limit: STREAM_COLLECTION_LIMIT,
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

  return {
    dehydratedState: dehydrate(queryClient),
    initialStatsDate,
  };
}
