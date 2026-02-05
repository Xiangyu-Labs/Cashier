import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { eq, or, isNull, asc, and } from "drizzle-orm";
import { cache } from "react";
import { EntryCategory } from "@/types/api";

/**
 * Data Access Layer for Entry Categories
 */

export const getEntryCategories = cache(async (ledgerId: string): Promise<EntryCategory[]> => {
    const rows = await db.query.entryCategories.findMany({
        where: and(or(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.ledgerId)), isNull(entryCategories.deletedAt)),
        orderBy: [asc(entryCategories.sortOrder)],
    });

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
    }));
});

/**
 * Cached version - now directly calling base function
 * React's cache() provides request-level deduplication
 */
export const getCachedEntryCategories = getEntryCategories;


