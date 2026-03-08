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
  // Performance tracking - server data fetch start
  const perfStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

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

  // Prefetch only first-screen (History Tab) necessary data in parallel
  // Other tab data will be prefetched client-side via usePrefetchRelatedData
  const STALE_TIME = 5 * 60 * 1000; // 5 minutes (matches global default)

  await Promise.all([
    // Core data - required for all tabs
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
    // History Tab data
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
  ]);

  // Performance tracking - server data fetch complete
  const perfEndTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Performance] Server prefetch: ${(perfEndTime - perfStartTime).toFixed(2)}ms`);
  }

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

