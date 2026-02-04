import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { eq, or, isNull, asc, and } from "drizzle-orm";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { EntryCategory } from "@/types/api";
import { cacheConfig } from "@/lib/cache-config";

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
 * Cached version for cross-request caching
 * Use in page.tsx for improved performance
 */
export const getCachedEntryCategories = (ledgerId: string) =>
    unstable_cache(
        () => getEntryCategories(ledgerId),
        [`categories-${ledgerId}`],
        {
            revalidate: cacheConfig.categories.revalidate,
            tags: cacheConfig.categories.tags(ledgerId),
        }
    )();

