import { auth } from "@/auth";
import { SettingsPageClient } from "@/features/ledger/components/SettingsPageClient";
import { redirect } from "@/i18n/routing";
import { db } from "@/lib/db";
import { ledgers, entryCategories, ledgerEntries } from "@/lib/db/schema";
import { eq, and, isNull, or, asc, sql } from "drizzle-orm";
import { serializeLedger, serializeEntryCategory } from "@/lib/serialization/utils";
import type { EntryCategoryWithCount } from "@/types/api";

// Inline data access - simplified architecture (no services layer)
async function getLedger(ledgerId: string) {
    const row = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });
    if (!row) return undefined;
    return serializeLedger(row);
}

async function getEntryCategories(ledgerId: string): Promise<EntryCategoryWithCount[]> {
    const rows = await db.query.entryCategories.findMany({
        where: and(or(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.ledgerId)), isNull(entryCategories.deletedAt)),
        orderBy: [asc(entryCategories.sortOrder)],
    });

    const entryCounts = await db
        .select({
            categoryId: ledgerEntries.categoryId,
            count: sql<number>`count(*)`.as('count'),
        })
        .from(ledgerEntries)
        .where(and(
            eq(ledgerEntries.ledgerId, ledgerId),
            isNull(ledgerEntries.deletedAt)
        ))
        .groupBy(ledgerEntries.categoryId);

    const countMap = new Map(entryCounts.map(e => [e.categoryId, e.count]));

    return rows.map(row => ({
        ...serializeEntryCategory(row),
        entryCount: countMap.get(row.id) || 0,
    }));
}

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: ledgerId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
        redirect({ href: "/login", locale: "en" });
    }

    // Optimized: Only fetch core data, credentials now fetched client-side
    const [ledger, categories] = await Promise.all([
        getLedger(ledgerId),
        getEntryCategories(ledgerId),
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

