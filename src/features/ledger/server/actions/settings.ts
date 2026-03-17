"use server";

import { db } from "@/lib/db";
import { serviceCredentials } from "@/lib/db/schema";
import { eq, and, isNull, sql, desc } from "drizzle-orm";
import { withLedgerAccess } from "@/lib/auth-actions";

/**
 * Batch fetch settings data in a single server action.
 * Returns uncategorizedCount and credentials only.
 * Categories are fetched separately via getEntryCategoriesAction to ensure
 * optimistic updates work correctly (shared query key with useCategoryMutations).
 */
export const getLedgerSettingsAction = withLedgerAccess(async (ledgerId: string) => {

    // Fetch data in parallel
    const [uncategorizedResult, credentials] = await Promise.all([
        // 1. Get uncategorized count
        (async () => {
            const { ledgerEntries } = await import("@/lib/db/schema");
            return db
                .select({
                    count: sql<number>`count(*)`.as('count'),
                })
                .from(ledgerEntries)
                .where(and(
                    eq(ledgerEntries.ledgerId, ledgerId),
                    isNull(ledgerEntries.deletedAt),
                    isNull(ledgerEntries.categoryId)
                ));
        })(),

        // 2. Get service credentials using standard select instead of relational query
        // to avoid potential Drizzle relation caching issues
        db
            .select({
                id: serviceCredentials.id,
                key: serviceCredentials.key,
                ledgerId: serviceCredentials.ledgerId,
                name: serviceCredentials.name,
                createdAt: serviceCredentials.createdAt,
                lastUsedAt: serviceCredentials.lastUsedAt,
                deletedAt: serviceCredentials.deletedAt,
            })
            .from(serviceCredentials)
            .where(and(
                eq(serviceCredentials.ledgerId, ledgerId),
                isNull(serviceCredentials.deletedAt)
            ))
            .orderBy(desc(serviceCredentials.createdAt)),
    ]);

    // Serialize credentials
    const serializedCredentials = credentials.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    }));

    return {
        uncategorizedCount: uncategorizedResult[0]?.count || 0,
        credentials: serializedCredentials,
    };
});
