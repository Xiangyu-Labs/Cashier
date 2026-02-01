import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getLedger, getLedgers } from "@/features/ledger/server/services/ledgers";
import { getEntryCategories } from "@/features/ledger/server/services/categories";
import { LedgerPageClient } from "@/features/ledger/components/LedgerPageClient";
import { Ledger, EntryCategory, SourceDocument, ServiceCredential } from "@/types/api";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { getSourceDocumentsAction } from "@/features/source-document/server/actions";
import { getServiceCredentials } from "@/features/ledger/server/services/credentials";

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
  const [ledger, categories, allLedgers, activeDocs, completedDocs, credentials] = await Promise.all([
    getLedger(ledgerId),
    getEntryCategories(ledgerId),
    getLedgers(session!.user!.id!),
    getSourceDocumentsAction(ledgerId, { status: 'queued,processing,anomaly', includeLedgerEntries: true }),
    getSourceDocumentsAction(ledgerId, { status: 'completed', includeLedgerEntries: true }),
    getServiceCredentials(ledgerId),
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
      initialActiveSourceDocuments={activeDocs.items as SourceDocument[]}
      initialCompletedSourceDocuments={completedDocs.items as SourceDocument[]}
      initialCredentials={credentials as ServiceCredential[]}
    />
  );
}
