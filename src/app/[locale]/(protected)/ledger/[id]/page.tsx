import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction, getLedgersAction, getDefaultLedgerIdAction } from "@/features/ledger/server/actions/ledgers";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { getLedgerSettingsAction } from "@/features/ledger/server/actions/settings";
import { getPendingSourceDocumentsAction, getAllSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { getEnhancedStats } from "@/features/stats/server/actions";
import { getLedgerEntriesAction } from "@/features/ledger/server/actions/entries";
import { getLedgerStatsAction } from "@/features/ledger/server/actions/stats";
import { parsePeriodFromSearchParams, periodToDateRange } from "@/lib/period-utils";
import { formatDateTimeForApi } from "@/lib/date-utils";
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

  // Prefetch all first-screen data using unified fetchers
  // These will be hydrated to the client and won't trigger additional requests
  const STALE_TIME = 5 * 60 * 1000; // 5 minutes (matches global default)

  // First, prefetch ledger to get main currency
  await queryClient.prefetchQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
  });

  const ledger = queryClient.getQueryData(queryKeys.ledger(ledgerId)) as Awaited<ReturnType<typeof getLedgerAction>> | undefined;
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency || 'CNY';
  const monthStartDay = ledger?.metadata?.settings?.monthStartDay || 1;

  // Inject monthStartDay into periodParams for currentPeriod preset
  const enrichedPeriodParams = periodParams.period === 'currentPeriod'
    ? { ...periodParams, monthStartDay }
    : periodParams;
  const dateRange = periodToDateRange(enrichedPeriodParams);

  // Calculate dates for stats prefetch (must match StatsTab.tsx exactly)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Prefetch remaining data in parallel
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.entryCategories(ledgerId),
      queryFn: () => getEntryCategoriesAction(ledgerId),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgers(),
      queryFn: () => getLedgersAction(),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.defaultLedgerId(),
      queryFn: () => getDefaultLedgerIdAction(),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'pending'),
      queryFn: () => getPendingSourceDocumentsAction(ledgerId),
      staleTime: 30 * 1000, // 30 seconds for pending (more dynamic)
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'all', dateRange.startDate, dateRange.endDate),
      queryFn: () => getAllSourceDocumentsAction(ledgerId, {
        startDate: dateRange.startDate ?? undefined,
        endDate: dateRange.endDate ?? undefined,
      }),
      staleTime: 30 * 1000,
    }),
    // Prefetch stats tab data - query key must match StatsTab.tsx exactly
    queryClient.prefetchQuery({
      queryKey: [
        ...queryKeys.enhancedStats(ledgerId),
        formatDateTimeForApi(startOfMonth),
        'month',
        mainCurrency,
      ],
      queryFn: async () => {
        // Calculate previous period for comparison
        const prevStartOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevEndOfMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        return getEnhancedStats({
          ledgerId,
          queryRange: {
            from: formatDateTimeForApi(startOfMonth),
            to: formatDateTimeForApi(endOfMonth),
          },
          compareRange: {
            from: formatDateTimeForApi(prevStartOfMonth),
            to: formatDateTimeForApi(prevEndOfMonth),
          },
        });
      },
      staleTime: STALE_TIME,
    }),
    // Prefetch settings tab data
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgerSettings(ledgerId),
      queryFn: () => getLedgerSettingsAction(ledgerId),
      staleTime: STALE_TIME,
    }),
    // Prefetch details tab summary data
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgerEntries(
        ledgerId,
        'summary',
        dateRange.startDate,
        dateRange.endDate,
        mainCurrency,
        undefined
      ),
      queryFn: () =>
        getLedgerStatsAction(
          ledgerId,
          dateRange.startDate ?? undefined,
          dateRange.endDate ?? undefined,
          mainCurrency,
          {}
        ),
      staleTime: STALE_TIME,
    }),
    // Prefetch details tab first page entries
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgerEntries(
        ledgerId,
        'infinite',
        dateRange.startDate,
        dateRange.endDate,
        undefined
      ),
      queryFn: () =>
        getLedgerEntriesAction(ledgerId, {
          startDate: dateRange.startDate ?? undefined,
          endDate: dateRange.endDate ?? undefined,
          limit: 50,
        }),
      staleTime: STALE_TIME,
    }),
  ]);

  // Check if ledger exists (already fetched above)
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

