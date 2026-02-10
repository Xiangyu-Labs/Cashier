import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction, getLedgersAction } from "@/features/ledger/server/actions/ledgers";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { getPendingSourceDocumentsAction, getUnifiedSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { parsePeriodFromSearchParams, periodToDateRange } from "@/lib/period-utils";

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
  const dateRange = periodToDateRange(periodParams);
  const session = await auth();
  const t = await getTranslations("LedgerPage");

  if (!session?.user?.id) {
    redirect({ href: "/login", locale: "en" });
  }

  // Create a new QueryClient for this request
  const queryClient = new QueryClient();

  // Prefetch all first-screen data using unified fetchers
  // These will be hydrated to the client and won't trigger additional requests
  const STALE_TIME = 5 * 60 * 1000; // 5 minutes

  await Promise.all([
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
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgers(),
      queryFn: () => getLedgersAction(),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'pending'),
      queryFn: () => getPendingSourceDocumentsAction(ledgerId),
      staleTime: 30 * 1000, // 30 seconds for pending (more dynamic)
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'unified', dateRange.startDate, dateRange.endDate),
      queryFn: () => getUnifiedSourceDocumentsAction(ledgerId, {
        startDate: dateRange.startDate ?? undefined,
        endDate: dateRange.endDate ?? undefined,
      }),
      staleTime: 30 * 1000,
    }),
  ]);

  // Check if ledger exists
  const ledger = queryClient.getQueryData(queryKeys.ledger(ledgerId));
  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LedgerPageClient ledgerId={ledgerId} initialPeriod={periodParams} />
    </HydrationBoundary>
  );
}

