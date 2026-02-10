import { db } from "@/lib/db";
import { entryCategories, ledgerEntries } from "@/lib/db/schema";
import { eq, or, isNull, asc, and, sql } from "drizzle-orm";
import { cache } from "react";
import { EntryCategoryWithCount } from "@/types/api";

/**
 * Data Access Layer for Entry Categories
 */

export const getEntryCategories = cache(async (ledgerId: string): Promise<EntryCategoryWithCount[]> => {
    const rows = await db.query.entryCategories.findMany({
        where: and(or(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.ledgerId)), isNull(entryCategories.deletedAt)),
        orderBy: [asc(entryCategories.sortOrder)],
    });

    // Get entry counts for each category
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

    // Create a map for quick lookup
    const countMap = new Map(entryCounts.map(e => [e.categoryId, e.count]));

    return rows.map(row => ({
        id: row.id,
        ledgerId: row.ledgerId,
        name: row.name,
        description: row.description || null,
        icon: row.icon || null,
        sortOrder: row.sortOrder,
        isEditable: row.isEditable ?? false,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        entryCount: countMap.get(row.id) || 0,
    }));
});


