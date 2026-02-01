
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getLedger } from "@/services/ledgers";
import { getEntryCategories } from "@/services/categories";
import { getServiceCredentials } from "@/services/credentials";
import { SettingsPageClient } from "@/components/ledger/SettingsPageClient";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/routing";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: ledgerId } = await params;
    const session = await auth();
    const t = await getTranslations("Settings");

    if (!session?.user?.id) {
        redirect({ href: "/login", locale: "en" });
    }

    // Parallel data fetching
    const [ledger, categories, credentials] = await Promise.all([
        getLedger(ledgerId),
        getEntryCategories(ledgerId),
        getServiceCredentials(ledgerId),
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
