import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getLedger, getLedgers } from "@/services/ledgers";
import { getEntryCategories } from "@/services/categories";
import { LedgerPageClient } from "@/components/ledger/LedgerPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";

export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: ledgerId } = await params;
  const session = await auth();
  const t = await getTranslations("LedgerPage");

  if (!session?.user?.id) {
    redirect({ href: "/login", locale: "en" }); // Locale hardcoded? No, use getLocale()
  }

  if (!session?.user?.id) {
    redirect({ href: "/login", locale: "en" });
  }

  // Parallel data fetching
  const [ledger, categories, allLedgers] = await Promise.all([
    getLedger(ledgerId),
    getEntryCategories(ledgerId),
    getLedgers(session!.user!.id!),
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
