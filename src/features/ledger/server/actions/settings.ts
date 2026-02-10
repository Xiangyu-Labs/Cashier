"use server";

import { db } from "@/lib/db";
import { entryCategories, serviceCredentials } from "@/lib/db/schema";
import { eq, asc, and, isNull, sql, desc } from "drizzle-orm";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";
import { forLedger } from "@/lib/db/scoped-query";

/**
 * Batch fetch all settings data in a single server action.
 * Combines getEntryCategoriesAction, getUncategorizedCountAction, and getServiceCredentialsAction
 * to reduce round-trips from 3 to 1.
 */
export async function getLedgerSettingsAction(ledgerId: string) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(entryCategories, ledgerId);
    const credQ = forLedger(serviceCredentials, ledgerId);

    // Fetch all data in parallel
    const [categories, entryCounts, uncategorizedResult, credentials] = await Promise.all([
        // 1. Get categories
        db.query.entryCategories.findMany({
            where: q.whereActive,
            orderBy: asc(entryCategories.sortOrder),
        }),

        // 2. Get entry counts for each category
        (async () => {
            const { ledgerEntries } = await import("@/lib/db/schema");
            return db
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
        })(),

        // 3. Get uncategorized count
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

        // 4. Get service credentials
        db.query.serviceCredentials.findMany({
            where: credQ.whereActive,
            orderBy: [desc(serviceCredentials.createdAt)],
        }),
    ]);

    // Create a map for quick lookup
    const countMap = new Map(entryCounts.map(e => [e.categoryId, e.count]));

    // Combine categories with counts
    const categoriesWithCount = categories.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        entryCount: countMap.get(c.id) || 0,
    }));

    // Serialize credentials
    const serializedCredentials = credentials.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    }));

    return {
        categories: categoriesWithCount,
        uncategorizedCount: uncategorizedResult[0]?.count || 0,
        credentials: serializedCredentials,
    };
}
