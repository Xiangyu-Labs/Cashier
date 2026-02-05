import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { cache } from "react";
import { Ledger } from "@/types/api";

/**
 * Data Access Layer for Ledgers
 * Direct database access functions to be used by Server Components and Server Actions.
 */

export const getLedgers = cache(async (userId: string): Promise<Ledger[]> => {
    const rows = await db.query.ledgers.findMany({
        where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
        orderBy: [desc(ledgers.createdAt)],
    });

    return rows.map(mapLedgerToApi);
});

export const getLedger = cache(async (ledgerId: string): Promise<Ledger | undefined> => {
    const row = await db.query.ledgers.findFirst({
        where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
    });

    if (!row) return undefined;
    return mapLedgerToApi(row);
});

// logger is unused here


function mapLedgerToApi(row: typeof ledgers.$inferSelect): Ledger {
    return {
        id: row.id,
        userId: row.userId,
        name: row.name,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    };
}

/**
 * Cached versions - now directly calling base functions
 * React's cache() provides request-level deduplication
 */
export const getCachedLedger = getLedger;
export const getCachedLedgers = getLedgers;


