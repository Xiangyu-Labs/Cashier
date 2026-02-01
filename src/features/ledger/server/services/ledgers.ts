import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { cache } from "react";
import { Ledger } from "@/types/api";

/**
 * Data Access Layer for Ledgers
 * Direct database access functions to be used by Server Components and Server Actions.
 */

export const getLedgers = cache(async (userId: string): Promise<Ledger[]> => {
    const rows = await db.query.ledgers.findMany({
        where: eq(ledgers.userId, userId),
        orderBy: [desc(ledgers.createdAt)],
    });

    return rows.map(mapLedgerToApi);
});

export const getLedger = cache(async (ledgerId: string): Promise<Ledger | undefined> => {
    const row = await db.query.ledgers.findFirst({
        where: eq(ledgers.id, ledgerId),
    });

    if (!row) return undefined;
    return mapLedgerToApi(row);
});

function mapLedgerToApi(row: typeof ledgers.$inferSelect): Ledger {
    return {
        id: row.id,
        userId: row.userId,
        name: row.name,
        aiLanguage: row.aiLanguage ?? "en", // Default? Schema says string not null usually or default
        currencies: row.currencies || [],
        mainCurrency: row.mainCurrency || "USD",
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        autoRecognizeDate: row.autoRecognizeDate ?? false,
        collapseProcessingDefault: row.collapseProcessingDefault ?? false,
        mergeSimilarItems: row.mergeSimilarItems ?? false,
        collapseBillsDefault: row.collapseBillsDefault ?? false,
        aiCustomPrompt: row.aiCustomPrompt || "",
    };
}
