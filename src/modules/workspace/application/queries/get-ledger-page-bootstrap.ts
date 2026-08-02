import { after } from "next/server";
import { QueryClient, dehydrate, type DehydratedState } from "@tanstack/react-query";
import { runtimeEnv } from "@/lib/env/runtime";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER, QUERY } from "@/lib/constants";
import { calculateLedgerStats } from "@/modules/ledger/application/queries/calculate-ledger-stats";
import { listEntryCategories } from "@/modules/ledger/application/queries/list-entry-categories";
import { listLedgerEntries } from "@/modules/ledger/application/queries/list-ledger-entries";
import { getEnhancedStats } from "@/modules/stats/application/queries/get-enhanced-stats";
import { listStreamPage } from "@/modules/source-document/application/queries/list-stream-page";
import { getStreamTotal } from "@/modules/source-document/application/queries/get-stream-total";
import type { StreamPage } from "@/modules/source-document/contracts";
import { canonicalizeSourceDocumentStatuses } from "@/modules/source-document/types";
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
import { getDateInTimezone, parseDateString } from "@/lib/date-utils";
import type { CategoryPort } from "@/application/contracts";
import type { ServiceCredentialPort } from "@/application/contracts";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";
import type { StatsReadPort } from "@/modules/stats/application/ports";
import type { SourceDocumentQueryPorts } from "@/modules/source-document/application/ports";
import { getLedgerSettingsView } from "@/modules/ledger/application/queries/get-ledger-settings-view";
import type { EntryCategoryWithCountDto } from "@/modules/ledger/contracts";

interface LedgerPageBootstrapResult {
  dehydratedState: DehydratedState;
  initialStatsDate: Date;
  initialCategories: EntryCategoryWithCountDto[];
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
  input: GetLedgerPageBootstrapInput,
  dependencies: {
    categories: CategoryPort;
    ledgerReads: LedgerReadPort;
    stats: StatsReadPort;
    sourceDocuments: SourceDocumentQueryPorts;
    credentials: ServiceCredentialPort;
  }
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
        settings: ledger.settings,
        createdAt: ledger.createdAt,
        updatedAt: ledger.updatedAt,
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

  const mainCurrency = ledgerDto.settings.mainCurrency ?? "CNY";
  const fixedTimeZone = ledgerDto.settings.timeZone ?? undefined;
  const zonedToday = getDateInTimezone(fixedTimeZone);
  const initialStatsDate = zonedToday != null ? parseDateString(zonedToday) : new Date();
  const detailsState = getDetailsInitialQueryState(
    input.periodParams,
    input.advancedFilters,
    fixedTimeZone
  );
  const statsState = getStatsInitialQueryState(initialStatsDate);
  const canonicalStreamStatuses = canonicalizeSourceDocumentStatuses(
    input.advancedFilters?.statuses
  );
  const streamStatusesKey = canonicalStreamStatuses?.join(",") ?? null;
  const streamFilterInput = {
    ...(detailsState.startDateStr !== null ? { startDate: detailsState.startDateStr } : {}),
    ...(detailsState.endDateStr !== null ? { endDate: detailsState.endDateStr } : {}),
    ...(input.advancedFilters?.minAmount != null
      ? { minAmount: input.advancedFilters.minAmount }
      : {}),
    ...(input.advancedFilters?.maxAmount != null
      ? { maxAmount: input.advancedFilters.maxAmount }
      : {}),
    ...(canonicalStreamStatuses != null ? { statuses: canonicalStreamStatuses } : {}),
  };

  const categoriesPromise = queryClient.fetchQuery({
    queryKey: queryKeys.entryCategories(input.ledgerId),
    queryFn: () => listEntryCategories(input.ledgerId, dependencies.categories),
    staleTime: LEDGER.STALE_TIME_MS,
  });
  await Promise.all([
    ...(input.initialTab === "stream"
      ? [
          // First stream page (all-statuses, filtered by period+amount, paginated)
          queryClient.prefetchInfiniteQuery({
            queryKey: queryKeys.sourceDocumentStream(input.ledgerId, {
              startDate: detailsState.startDateStr,
              endDate: detailsState.endDateStr,
              minAmount: input.advancedFilters?.minAmount,
              maxAmount: input.advancedFilters?.maxAmount,
              statuses: streamStatusesKey,
            }),
            queryFn: ({ pageParam }) =>
              listStreamPage(
                input.ledgerId,
                {
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
                  ...(canonicalStreamStatuses != null ? { statuses: canonicalStreamStatuses } : {}),
                  cursor: pageParam as string | undefined,
                  limit: 20,
                },
                dependencies.sourceDocuments
              ),
            initialPageParam: undefined as string | undefined,
            getNextPageParam: (lastPage: StreamPage) => lastPage.nextCursor,
            staleTime: runtimeEnv.sourceDocStaleTimeMs,
          }),
          queryClient.prefetchQuery({
            queryKey: queryKeys.sourceDocumentStreamTotal(input.ledgerId, {
              startDate: detailsState.startDateStr,
              endDate: detailsState.endDateStr,
              minAmount: input.advancedFilters?.minAmount,
              maxAmount: input.advancedFilters?.maxAmount,
              statuses: streamStatusesKey,
            }),
            queryFn: () =>
              getStreamTotal(
                input.ledgerId,
                streamFilterInput,
                dependencies.sourceDocuments.documents
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
                input.advancedFilters,
                dependencies.ledgerReads
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
              listLedgerEntries(
                input.ledgerId,
                {
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
                },
                dependencies.ledgerReads
              ),
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
              getEnhancedStats(
                {
                  ledgerId: input.ledgerId,
                  queryRange: {
                    from: statsState.startDateStr,
                    to: statsState.endDateStr,
                  },
                  compareRange: {
                    from: statsState.prevDateStartStr,
                    to: statsState.prevDateEndStr,
                  },
                },
                dependencies.stats
              ),
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
        ]
      : []),
    ...(input.initialTab === "settings"
      ? [
          queryClient.prefetchQuery({
            queryKey: queryKeys.ledgerSettings(input.ledgerId),
            queryFn: () =>
              getLedgerSettingsView(input.ledgerId, {
                categories: dependencies.categories,
                credentials: dependencies.credentials,
              }),
            staleTime: LEDGER.STALE_TIME_MS,
          }),
        ]
      : []),
    categoriesPromise,
  ]);
  const initialCategories = await categoriesPromise;

  // Schedule recovery of any missed processing intents after the response is sent
  after(() => scheduleProcessingRecovery(input.ledgerId));

  return {
    dehydratedState: dehydrate(queryClient),
    initialStatsDate,
    initialCategories,
  };
}
