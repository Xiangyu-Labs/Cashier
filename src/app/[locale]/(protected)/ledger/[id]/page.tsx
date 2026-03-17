import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction, getLedgersAction } from "@/features/ledger/server/actions/get";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import {
  getPendingSourceDocumentsAction,
  getAllSourceDocumentsAction,
} from "@/features/source-document/server/actions";
import { parsePeriodFromSearchParams, periodToDateRange } from "@/lib/period-utils";
import { LEDGER, QUERY } from "@/lib/constants";

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: ledgerId } = await params;
  const resolvedSearchParams = await searchParams;

  // Parse period from URL (default: thisMonth)
  const periodParams = parsePeriodFromSearchParams(resolvedSearchParams);
  const session = await auth();

  const t = await getTranslations("LedgerPage");

  if (session?.user?.id == null) {
    redirect({ href: "/login", locale: "en" });
  }

  // Create a new QueryClient for this request
  const queryClient = new QueryClient();
  const STALE_TIME = LEDGER.STALE_TIME_MS; // 10 minutes

  // Step 1: First fetch ledger data (other queries depend on it for mainCurrency)
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

  const dateRange = periodToDateRange(periodParams);

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
      queryKey: queryKeys.sourceDocuments(ledgerId, "pending"),
      queryFn: () => getPendingSourceDocumentsAction(ledgerId),
      staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS, // 30 seconds
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, "all", dateRange.startDate, dateRange.endDate),
      queryFn: async () => {
        const response = await getAllSourceDocumentsAction(ledgerId, {
          startDate: dateRange.startDate ?? undefined,
          endDate: dateRange.endDate ?? undefined,
        });
        return response;
      },
      staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS, // 30 seconds
    }),
  ]);

  // Create a stable initial date for StatsTab to avoid hydration mismatch
  const initialStatsDate = new Date();

  const dehydratedState = dehydrate(queryClient);

  return (
    <HydrationBoundary state={dehydratedState}>
      <LedgerPageClient
        ledgerId={ledgerId}
        initialPeriod={periodParams}
        initialStatsDate={initialStatsDate}
      />
    </HydrationBoundary>
  );
}
