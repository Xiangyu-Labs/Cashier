
import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { eq, or, isNull, asc } from "drizzle-orm";
import { cache } from "react";
import { EntryCategory } from "@/types/api";

/**
 * Data Access Layer for Entry Categories
 */

export const getEntryCategories = cache(async (ledgerId: string): Promise<EntryCategory[]> => {
    const rows = await db.query.entryCategories.findMany({
        where: or(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.ledgerId)),
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
    }));
});
