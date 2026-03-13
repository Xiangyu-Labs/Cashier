import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction, getLedgersAction } from "@/features/ledger/server/actions/ledgers";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { getPendingSourceDocumentsAction, getAllSourceDocumentsAction } from "@/features/source-document/server/actions";
import { parsePeriodFromSearchParams, periodToDateRange } from "@/lib/period-utils";

// Development-only performance logger
const isDev = process.env.NODE_ENV === 'development';
function perfLog(label: string, startTime: number) {
  if (!isDev) return Date.now();
  const duration = Date.now() - startTime;
  console.log(`[PERF] ${label}: ${duration}ms`);
  return Date.now();
}

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const startTime = Date.now();

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
  const STALE_TIME = 5 * 60 * 1000;

  // Step 1: First fetch ledger data (other queries depend on it for mainCurrency and monthStartDay)
  const ledger = await queryClient.fetchQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
  });

  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  // Get actual settings from ledger (ensures server/client query key consistency)
  const monthStartDay = ledger?.metadata?.settings?.monthStartDay ?? 1;

  const enrichedPeriodParams = periodParams.period === 'currentPeriod'
    ? { ...periodParams, monthStartDay }
    : periodParams;
  const dateRange = periodToDateRange(enrichedPeriodParams);

  // Step 2: Prefetch core data (used by all tabs) and History Tab data
  await Promise.all([
    // ===== Core data (all tabs) =====
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

    // ===== History Tab data (default active tab) =====
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
  ]);

  // Create a stable initial date for StatsTab to avoid hydration mismatch
  const initialStatsDate = new Date();

  const dehydratedState = dehydrate(queryClient);

  // Warn if dehydrated state is too large (development only)
  if (isDev) {
    const dehydratedJson = JSON.stringify(dehydratedState);
    const sizeKB = new TextEncoder().encode(dehydratedJson).length / 1024;
    if (sizeKB > 500) {
      console.warn(`[PERF WARNING] Dehydrated state is large: ${sizeKB.toFixed(2)} KB`);
    }
    perfLog("=== TOTAL Server Render", startTime);
  }

  return (
    <HydrationBoundary state={dehydratedState}>
      <LedgerPageClient ledgerId={ledgerId} initialPeriod={enrichedPeriodParams} initialStatsDate={initialStatsDate} />
    </HydrationBoundary>
  );
}

