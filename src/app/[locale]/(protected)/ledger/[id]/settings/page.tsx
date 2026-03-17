import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getLedgerAction } from "@/features/ledger/server/actions/get";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { getLedgerSettingsAction } from "@/features/ledger/server/actions/settings";
import { SettingsPageClient } from "@/features/ledger/components/SettingsPageClient";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER } from "@/lib/constants";

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { id: ledgerId } = await params;
  const queryClient = new QueryClient();

  const STALE_TIME = LEDGER.STALE_TIME_MS;

  // Prefetch ledger data
  const ledger = await queryClient.fetchQuery({
    queryKey: queryKeys.ledger(ledgerId),
    queryFn: () => getLedgerAction(ledgerId),
    staleTime: STALE_TIME,
  });

  if (!ledger) {
    return <div>Ledger not found</div>;
  }

  // Prefetch categories
  const categories = await queryClient.fetchQuery({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    staleTime: STALE_TIME,
  });

  // Prefetch ledger settings (credentials and uncategorized count)
  await queryClient.prefetchQuery({
    queryKey: queryKeys.ledgerSettings(ledgerId),
    queryFn: () => getLedgerSettingsAction(ledgerId),
    staleTime: STALE_TIME,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettingsPageClient ledger={ledger} initialCategories={categories} ledgerId={ledgerId} />
    </HydrationBoundary>
  );
}
