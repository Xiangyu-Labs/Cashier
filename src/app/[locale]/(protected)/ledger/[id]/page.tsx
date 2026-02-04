import { auth } from "@/auth";
import { getCachedLedger, getCachedLedgers } from "@/features/ledger/server/services/ledgers";
import { getCachedEntryCategories } from "@/features/ledger/server/services/categories";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ledgerId } = await params;
  const session = await auth();
  const t = await getTranslations("LedgerPage");

  if (!session?.user?.id) {
    redirect({ href: "/login", locale: "en" });
  }

  // Optimized: Only fetch core data (3 queries instead of 6)
  // Source documents and credentials now fetched client-side
  const [ledger, categories, allLedgers] = await Promise.all([
    getCachedLedger(ledgerId),
    getCachedEntryCategories(ledgerId),
    getCachedLedgers(session!.user!.id!),
  ]);

  if (!ledger) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <p className="text-muted">{t("notFound")}</p>
      </div>
    );
  }

  return (
    <LedgerPageClient
      initialLedger={ledger}
      initialCategories={categories}
      allLedgers={allLedgers}
      ledgerId={ledgerId}
    />
  );
}

