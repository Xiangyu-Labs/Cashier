import { auth } from "@/auth";
import { getCachedLedger } from "@/features/ledger/server/services/ledgers";
import { getCachedEntryCategories } from "@/features/ledger/server/services/categories";
import { SettingsPageClient } from "@/features/ledger/components/SettingsPageClient";
import { redirect } from "@/i18n/routing";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: ledgerId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
        redirect({ href: "/login", locale: "en" });
    }

    // Optimized: Only fetch core data, credentials now fetched client-side
    const [ledger, categories] = await Promise.all([
        getCachedLedger(ledgerId),
        getCachedEntryCategories(ledgerId),
    ]);

    if (!ledger) {
        return <div>Ledger not found</div>;
    }

    return (
        <SettingsPageClient
            ledger={ledger}
            initialCategories={categories}
            ledgerId={ledgerId}
        />
    );
}

