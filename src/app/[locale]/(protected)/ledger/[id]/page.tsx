import { Suspense } from "react";
import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction, getLedgersAction } from "@/features/ledger/server/actions/get";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getEnhancedStats } from "@/features/stats/server/actions";
import {
  getPendingSourceDocumentsAction,
  getAllSourceDocumentsAction,
} from "@/features/source-document/server/actions";
import { parsePeriodFromSearchParams, type PeriodParams } from "@/lib/period-utils";
import { LEDGER, QUERY } from "@/lib/constants";
import { LedgerPageSkeleton } from "@/components/skeletons";
import { getDetailsInitialQueryState, getStatsInitialQueryState } from "@/features/ledger/lib/initial-query-state";
import { parseLedgerTab, type LedgerTab } from "@/features/ledger/lib/tabs";

interface LedgerPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface LedgerPageContentProps {
  ledgerId: string;
  initialTab: LedgerTab;
  periodParams: PeriodParams;
}

async function LedgerPageContent({
  ledgerId,
  initialTab,
  periodParams,
}: LedgerPageContentProps) {
  const t = await getTranslations("LedgerPage");
  const queryClient = new QueryClient();
  const ledger = await queryClient.fetchQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: LEDGER.STALE_TIME_MS,
  });

  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
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

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LedgerPageClient
        ledgerId={ledgerId}
        initialTab={initialTab}
        initialPeriod={periodParams}
        initialStatsDate={initialStatsDate}
      />
    </HydrationBoundary>
  );
}

export default async function LedgerPage({ params, searchParams }: LedgerPageProps) {
  const { id: ledgerId } = await params;
  const resolvedSearchParams = await searchParams;
  const periodParams = parsePeriodFromSearchParams(resolvedSearchParams);
  const initialTab = parseLedgerTab(resolvedSearchParams);
  const session = await auth();

  if (session?.user?.id == null) {
    redirect({ href: "/login", locale: "en" });
  }

  return (
    <Suspense fallback={<LedgerPageSkeleton activeTab={initialTab} />}>
      <LedgerPageContent ledgerId={ledgerId} initialTab={initialTab} periodParams={periodParams} />
    </Suspense>
  );
}
