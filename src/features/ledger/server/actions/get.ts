"use server";

import { db } from "@/lib/db";
import { ledgers } from "@/lib/db/schema";
import { withAuth } from "@/lib/auth-actions";
import { eq, and, isNull, desc } from "drizzle-orm";
import { unstable_cache } from "next/cache";

// Cached version of getLedgerAction with cache tagging for revalidation
const cachedGetLedger = unstable_cache(
    async (ledgerId: string, userId: string): Promise<import("@/types/api").Ledger | null> => {
        const existing = await db.query.ledgers.findFirst({
            where: and(eq(ledgers.id, ledgerId), isNull(ledgers.deletedAt)),
        });

        if (!existing || existing.userId !== userId) {
            return null;
        }

        return {
            id: existing.id,
            userId: existing.userId,
            name: existing.name,
            metadata: existing.metadata,
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
            deletedAt: existing.deletedAt ? existing.deletedAt.toISOString() : null,
        };
    },
    ['ledger'],
    {
        revalidate: 60, // Cache for 60 seconds
        tags: ['ledger'],
    }
);

export const getLedgerAction = withAuth(async (userId: string, id: string): Promise<import("@/types/api").Ledger | null> => {
    // Use versioned cache key to invalidate on app updates
    return cachedGetLedger(id, userId);
});

// Cached version of getLedgersAction
const cachedGetLedgers = unstable_cache(
    async (userId: string): Promise<import("@/types/api").Ledger[]> => {
        const rows = await db.query.ledgers.findMany({
            where: and(eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
            orderBy: [desc(ledgers.createdAt)],
        });

        return rows.map(row => ({
            id: row.id,
            userId: row.userId,
            name: row.name,
            metadata: row.metadata,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        }));
    },
    ['ledgers'],
    {
        revalidate: 60,
        tags: ['ledgers'],
    }
);

export const getLedgersAction = withAuth(async (userId: string): Promise<import("@/types/api").Ledger[]> => {
    return cachedGetLedgers(userId);
});
