import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getLedgerAction, getLedgersAction } from "@/features/ledger/server/actions/ledgers";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { getLedgerSettingsAction } from "@/features/ledger/server/actions/settings";
import { getPendingSourceDocumentsAction, getUnifiedSourceDocumentsAction } from "@/features/source-document/server/actions/main";
import { getEnhancedStats } from "@/features/stats/server/actions";
import { parsePeriodFromSearchParams, periodToDateRange } from "@/lib/period-utils";
import { formatDateTimeForApi } from "@/lib/date-utils";
import { batchConvertCurrencyAction, type BatchConversionItem } from "@/features/currency/server/actions";

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
  const STALE_TIME = 10 * 60 * 1000; // 10 minutes (increased for better caching)

  // First, prefetch ledger to get main currency
  await queryClient.prefetchQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
  });

  const ledger = queryClient.getQueryData(queryKeys.ledger(ledgerId)) as Awaited<ReturnType<typeof getLedgerAction>> | undefined;
  const mainCurrency = ledger?.metadata?.settings?.mainCurrency || 'CNY';

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
    // Prefetch stats tab data
    queryClient.prefetchQuery({
      queryKey: [
        ...queryKeys.enhancedStats(ledgerId),
        dateRange.startDate || formatDateTimeForApi(new Date()),
        periodParams.period || 'thisMonth',
        mainCurrency,
      ],
      queryFn: async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

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
  ]);

  // Prefetch currency conversions for unified source documents
  const unifiedDocsResult = queryClient.getQueryData(
    queryKeys.sourceDocuments(ledgerId, 'unified', dateRange.startDate, dateRange.endDate)
  ) as Awaited<ReturnType<typeof getUnifiedSourceDocumentsAction>> | undefined;

  if (unifiedDocsResult?.groups) {
    // Extract all entries that need currency conversion from all groups
    const conversionItems: BatchConversionItem[] = [];

    // Iterate through all groups (queued, processing, anomaly, completed)
    const allDocs = [
      ...unifiedDocsResult.groups.queued,
      ...unifiedDocsResult.groups.processing,
      ...unifiedDocsResult.groups.anomaly,
      ...unifiedDocsResult.groups.completed,
    ];

    allDocs.forEach(group => {
      group.ledgerEntries?.forEach(entry => {
        const currency = entry.currency || mainCurrency;
        if (currency !== mainCurrency) {
          conversionItems.push({
            amount: parseFloat(entry.amount),
            currency,
            date: group.sourceDocument.entryDate || entry.createdAt,
          });
        }
      });
    });

    // Prefetch batch conversion if there are items to convert
    if (conversionItems.length > 0) {
      const cacheKey = JSON.stringify(conversionItems.map(i => ({
        a: i.amount,
        c: i.currency,
        d: i.date?.split('T')[0]
      })));

      await queryClient.prefetchQuery({
        queryKey: queryKeys.batchConvert(cacheKey, mainCurrency),
        queryFn: () => batchConvertCurrencyAction(conversionItems, mainCurrency),
        staleTime: 24 * 60 * 60 * 1000, // 24 hours - exchange rates don't change often
      });
    }
  }

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
      <LedgerPageClient ledgerId={ledgerId} initialPeriod={periodParams} />
    </HydrationBoundary>
  );
}

