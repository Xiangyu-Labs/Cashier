import { auth } from "@/auth";
import { getLedger } from "@/features/ledger/server/services/ledgers";
import { getEntryCategories } from "@/features/ledger/server/services/categories";
import { getServiceCredentialsAction } from "@/features/ledger/server/actions/credentials";
import { SettingsPageClient } from "@/features/ledger/components/SettingsPageClient";
import { redirect } from "@/i18n/routing";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: ledgerId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
        redirect({ href: "/login", locale: "en" });
    }

    // Parallel data fetching
    const [ledger, categories, credentials] = await Promise.all([
        getLedger(ledgerId),
        getEntryCategories(ledgerId),
        getServiceCredentialsAction(ledgerId),
    ]);

    if (!ledger) {
        return <div>Ledger not found</div>;
    }

    return (
        <SettingsPageClient
            ledger={ledger}
            initialCategories={categories}
            initialCredentials={credentials}
            ledgerId={ledgerId}
        />
    );
}
