import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction } from "@/features/ledger/server/actions/ledgers";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { getPendingSourceDocumentsAction, getAllSourceDocumentsAction } from "@/features/source-document/server/actions";
import { parsePeriodFromSearchParams, periodToDateRange } from "@/lib/period-utils";
// NEW IMPORTS for other tabs
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getEnhancedStats } from "@/features/stats/server/actions";
import { getLedgerSettingsAction } from "@/features/ledger/server/actions/settings";
import { formatDateTimeForApi, getDateRange } from "@/lib/date-utils";

// Default values to eliminate serial dependency on ledger fetch
const DEFAULT_MAIN_CURRENCY = 'CNY';
const DEFAULT_MONTH_START_DAY = 1;

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: ledgerId } = await params;
  const resolvedSearchParams = await searchParams;

  // Parse period from URL (default: currentPeriod)
  const periodParams = parsePeriodFromSearchParams(resolvedSearchParams);
  const session = await auth();
  const t = await getTranslations("LedgerPage");

  if (!session?.user?.id) {
    redirect({ href: "/login", locale: "en" });
  }

  // Create a new QueryClient for this request
  const queryClient = new QueryClient();

  // Use default values to allow parallel fetching without waiting for ledger
  const monthStartDay = DEFAULT_MONTH_START_DAY;
  const enrichedPeriodParams = periodParams.period === 'currentPeriod'
    ? { ...periodParams, monthStartDay }
    : periodParams;
  const dateRange = periodToDateRange(enrichedPeriodParams);
  const mainCurrency = DEFAULT_MAIN_CURRENCY;

  const STALE_TIME = 5 * 60 * 1000;

  // Prefetch ALL tabs data in parallel
  await Promise.all([
    // ===== Core data (all tabs) =====
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledger(ledgerId),
      queryFn: () => getLedgerAction(ledgerId),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.entryCategories(ledgerId),
      queryFn: () => getEntryCategoriesAction(ledgerId),
      staleTime: STALE_TIME,
    }),

    // ===== History Tab data =====
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'pending'),
      queryFn: () => getPendingSourceDocumentsAction(ledgerId),
      staleTime: 30 * 1000,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'all', dateRange.startDate, dateRange.endDate),
      queryFn: () => getAllSourceDocumentsAction(ledgerId, {
        startDate: dateRange.startDate ?? undefined,
        endDate: dateRange.endDate ?? undefined,
      }),
      staleTime: 30 * 1000,
    }),

    // ===== Details Tab data =====
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgerEntries(ledgerId, "summary", dateRange.startDate, dateRange.endDate, mainCurrency),
      queryFn: () => getLedgerStatsAction(
        ledgerId,
        dateRange.startDate ?? undefined,
        dateRange.endDate ?? undefined,
        mainCurrency,
        undefined
      ),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.ledgerEntries(ledgerId, "infinite", dateRange.startDate, dateRange.endDate),
      queryFn: ({ pageParam }) => getLedgerEntriesAction(ledgerId, {
        startDate: dateRange.startDate ?? undefined,
        endDate: dateRange.endDate ?? undefined,
        cursor: pageParam,
        limit: 50,
      }),
      initialPageParam: undefined as string | undefined,
      staleTime: STALE_TIME,
    }),

    // ===== Stats Tab data =====
    (() => {
      const range = getDateRange(new Date(), "month", monthStartDay);
      const startStr = formatDateTimeForApi(range.startDate);
      const endStr = formatDateTimeForApi(range.endDate);
      const prevDate = new Date();
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevRange = getDateRange(prevDate, "month", monthStartDay);
      const prevStartStr = formatDateTimeForApi(prevRange.startDate);
      const prevEndStr = formatDateTimeForApi(prevRange.endDate);

      return queryClient.prefetchQuery({
        queryKey: [...queryKeys.enhancedStats(ledgerId), startStr, "month", mainCurrency],
        queryFn: () => getEnhancedStats({
          ledgerId,
          queryRange: { from: startStr, to: endStr },
          compareRange: { from: prevStartStr, to: prevEndStr },
        }),
        staleTime: STALE_TIME,
      });
    })(),

    // ===== Settings Tab data =====
    // Note: getLedgerSettingsAction returns both settings AND credentials
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgerSettings(ledgerId),
      queryFn: () => getLedgerSettingsAction(ledgerId),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgers(),
      queryFn: () => getLedgersAction(),
      staleTime: STALE_TIME,
    }),
  ]);

  // Check if ledger exists
  const ledger = queryClient.getQueryData(queryKeys.ledger(ledgerId)) as Awaited<ReturnType<typeof getLedgerAction>> | undefined;
  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LedgerPageClient ledgerId={ledgerId} initialPeriod={enrichedPeriodParams} />
    </HydrationBoundary>
  );
}

