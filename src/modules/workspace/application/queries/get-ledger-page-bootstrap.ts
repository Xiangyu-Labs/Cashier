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
import { requireLedgerAccess } from "@/modules/ledger/access";
import type { LedgerAdvancedFilters } from "@/modules/workspace/initial-query-state";
import type { PeriodParams } from "@/lib/period-utils";
import type { LedgerDto } from "@/modules/ledger/contracts";
import type { LedgerTab } from "@/modules/workspace/tabs";
import { NotFoundError, UnauthorizedError } from "@/lib/errors";
import { getDateInTimezone, parseDateString } from "@/lib/date-utils";
import type { CategoryPort } from "@/application/contracts";
import type { ServiceCredentialPort } from "@/application/contracts";
import type { LedgerReadPort } from "@/modules/ledger/application/ports";
import type { StatsReadPort } from "@/modules/stats/application/ports";
import type { SourceDocumentQueryPorts } from "@/modules/source-document/application/ports";
import { getLedgerSettingsView } from "@/modules/ledger/application/queries/get-ledger-settings-view";
import type { EntryCategoryWithCountDto } from "@/modules/ledger/contracts";
import {
  buildDetailsQueryDescriptor,
  buildStatsQueryDescriptor,
  buildStreamQueryDescriptor,
} from "@/modules/workspace/ledger-tab-query-descriptors";

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
  const detailsDescriptor = buildDetailsQueryDescriptor({
    ledgerId: input.ledgerId,
    periodParams: input.periodParams,
    ...(input.advancedFilters !== undefined ? { advancedFilters: input.advancedFilters } : {}),
    ...(fixedTimeZone !== undefined ? { timeZone: fixedTimeZone } : {}),
    mainCurrency,
  });
  const statsDescriptor = buildStatsQueryDescriptor({
    ledgerId: input.ledgerId,
    currentDate: initialStatsDate,
    mainCurrency,
  });
  const streamDescriptor = buildStreamQueryDescriptor({
    ledgerId: input.ledgerId,
    startDate: detailsDescriptor.startDateStr,
    endDate: detailsDescriptor.endDateStr,
    minAmount: input.advancedFilters?.minAmount,
    maxAmount: input.advancedFilters?.maxAmount,
    statuses: input.advancedFilters?.statuses,
    search: input.advancedFilters?.search,
  });

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
            queryKey: streamDescriptor.queryKey,
            queryFn: ({ pageParam }) =>
              listStreamPage(
                input.ledgerId,
                streamDescriptor.getPageInput(pageParam as string | undefined),
                dependencies.sourceDocuments
              ),
            initialPageParam: undefined as string | undefined,
            getNextPageParam: (lastPage: StreamPage) => lastPage.nextCursor,
            staleTime: runtimeEnv.sourceDocStaleTimeMs,
          }),
          queryClient.prefetchQuery({
            queryKey: streamDescriptor.totalQueryKey,
            queryFn: () =>
              getStreamTotal(
                input.ledgerId,
                streamDescriptor.totalInput,
                dependencies.sourceDocuments.documents
              ),
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
        ]
      : []),
    ...(input.initialTab === "details"
      ? [
          queryClient.prefetchQuery({
            queryKey: detailsDescriptor.summaryQueryKey,
            queryFn: () =>
              calculateLedgerStats(
                input.ledgerId,
                detailsDescriptor.summaryParams.startDate,
                detailsDescriptor.summaryParams.endDate,
                detailsDescriptor.summaryParams.mainCurrency,
                detailsDescriptor.summaryParams.filters,
                dependencies.ledgerReads
              ),
            staleTime: QUERY.DEFAULT_STALE_TIME_MS,
          }),
          queryClient.prefetchInfiniteQuery({
            queryKey: detailsDescriptor.entriesQueryKey,
            queryFn: ({ pageParam }) =>
              listLedgerEntries(
                input.ledgerId,
                detailsDescriptor.getEntriesInput(pageParam as string | undefined),
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
            queryKey: statsDescriptor.queryKey,
            queryFn: () => getEnhancedStats(statsDescriptor.input, dependencies.stats),
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

  return {
    dehydratedState: dehydrate(queryClient),
    initialStatsDate,
    initialCategories,
  };
}
