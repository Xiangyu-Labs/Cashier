import { auth } from "@/auth";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  fetchLedger,
  fetchLedgers,
  fetchEntryCategories,
  fetchPendingSourceDocuments,
  fetchUnifiedSourceDocuments,
} from "@/lib/fetchers";

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ledgerId } = await params;
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
      queryFn: () => fetchLedger(ledgerId),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.entryCategories(ledgerId),
      queryFn: () => fetchEntryCategories(ledgerId),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgers(),
      queryFn: () => fetchLedgers(),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'pending'),
      queryFn: () => fetchPendingSourceDocuments(ledgerId),
      staleTime: 30 * 1000, // 30 seconds for pending (more dynamic)
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'unified'),
      queryFn: () => fetchUnifiedSourceDocuments(ledgerId, {}),
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
      <LedgerPageClient ledgerId={ledgerId} />
    </HydrationBoundary>
  );
}

