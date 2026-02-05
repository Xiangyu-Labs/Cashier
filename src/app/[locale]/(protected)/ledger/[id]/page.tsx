import { auth } from "@/auth";
import { getCachedLedger, getCachedLedgers } from "@/features/ledger/server/services/ledgers";
import { getCachedEntryCategories } from "@/features/ledger/server/services/categories";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { getUnifiedSourceDocumentsAction } from "@/features/source-document/server/actions/main";

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ledgerId } = await params;
  const session = await auth();
  const t = await getTranslations("LedgerPage");

  if (!session?.user?.id) {
    redirect({ href: "/login", locale: "en" });
  }

  // Create a new QueryClient for this request
  const queryClient = new QueryClient();

  // Prefetch all required data in parallel
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledger(ledgerId),
      queryFn: () => getCachedLedger(ledgerId),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.entryCategories(ledgerId),
      queryFn: () => getCachedEntryCategories(ledgerId),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.ledgers(),
      queryFn: () => getCachedLedgers(session!.user!.id!),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.sourceDocuments(ledgerId, 'unified'),
      queryFn: () => getUnifiedSourceDocumentsAction(ledgerId, {}),
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
