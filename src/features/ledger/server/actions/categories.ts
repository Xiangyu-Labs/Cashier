"use server";

import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
//
// Server-side cache revalidation removed - client-side TanStack Query handles cache invalidation
import { z } from "zod";
import { eq, asc, and, isNull, sql, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { requireLedgerAccess } from "@/features/auth/server/utils/helpers";

const createCategorySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    sortOrder: z.number().optional(),
});

const updateCategorySchema = createCategorySchema.partial().extend({
    sortOrder: z.number().optional(),
});

import { forLedger } from "@/lib/db/scoped-query";

export async function createEntryCategoryAction(ledgerId: string, data: z.infer<typeof createCategorySchema>): Promise<import("@/lib/db/schema").EntryCategory> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const validated = createCategorySchema.parse(data);

    const [category] = await db.insert(entryCategories).values({
        ...validated,
        ledgerId: ledgerId,
    }).returning();

    // Trigger AI to generate metadata (async)
    // Only if icon or description is missing
    if (!validated.icon || !validated.description) {
        try {
            // Fetch existing categories for context
            const existing = await db.query.entryCategories.findMany({
                where: and(
                    eq(entryCategories.ledgerId, ledgerId),
                    isNull(entryCategories.deletedAt)
                ),
                columns: { name: true, description: true, icon: true }
            });

            // Dynamically import to avoid circular dependency issues
            const { flowEngine } = await import("@/lib/flow");
            const { TASK_TYPE_GENERATE_CATEGORY_METADATA } = await import("@/features/ledger/server/tasks/generate-category-metadata");

            await flowEngine.submit(
                TASK_TYPE_GENERATE_CATEGORY_METADATA,
                {
                    ledgerId: ledgerId,
                    categoryId: category.id,
                    categoryName: category.name,
                    existingCategories: existing,
                    aiLanguage: "zh-CN",
                },
                {
                    title: `Generate metadata for category: ${validated.name}`,
                }
            );
        } catch (err) {
            logger.error({ err, ledgerId }, "Failed to submit category metadata task");
            // Don't fail the request, just log
        }
    }

    return category;
}

export async function updateEntryCategoryAction(ledgerId: string, categoryId: string, data: z.infer<typeof updateCategorySchema>): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const validated = updateCategorySchema.parse(data);
    const q = forLedger(entryCategories, ledgerId);

    await db.update(entryCategories)
        .set(validated)
        .where(q.whereId(categoryId));
}

export async function deleteEntryCategoryAction(ledgerId: string, categoryId: string): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    // Cancel any pending/running background tasks for this category
    const { flowEngine } = await import("@/lib/flow");
    const { taskRuns } = await import("@/features/tasks/server/schema");

    const pendingTasks = await db
        .select({ id: taskRuns.id })
        .from(taskRuns)
        .where(and(
            eq(taskRuns.type, "generate_category_metadata"),
            inArray(taskRuns.status, ["pending", "running"]),
            isNull(taskRuns.deletedAt),
            sql`json_extract(${taskRuns.input}, '$.categoryId') = ${categoryId}`
        ));

    for (const task of pendingTasks) {
        await flowEngine.cancel(task.id);
    }

    const { ledgerEntries } = await import("@/lib/db/schema");
    const q = forLedger(entryCategories, ledgerId);

    // better-sqlite3 transactions are synchronous, so we use a sync callback
    db.transaction((tx) => {
        // First, set categoryId to null for all entries in this category
        // This makes them "uncategorized" instead of orphaned
        tx.update(ledgerEntries)
            .set({ categoryId: null })
            .where(and(
                eq(ledgerEntries.ledgerId, ledgerId),
                eq(ledgerEntries.categoryId, categoryId),
                isNull(ledgerEntries.deletedAt)
            ))
            .run();

        // Then soft-delete the category
        tx.update(entryCategories)
            .set(q.softDelete)
            .where(q.whereId(categoryId))
            .run();
    });
}

export async function reorderEntryCategoriesAction(ledgerId: string, categoryIds: string[]): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    // better-sqlite3 transactions are synchronous
    db.transaction((tx) => {
        for (let i = 0; i < categoryIds.length; i++) {
            // Ensure we only update categories belonging to this ledger
            tx.update(entryCategories)
                .set({ sortOrder: i })
                .where(and(eq(entryCategories.id, categoryIds[i]), eq(entryCategories.ledgerId, ledgerId)))
                .run();
        }
    });
}

export async function getEntryCategoriesAction(ledgerId: string) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const q = forLedger(entryCategories, ledgerId);

    // Note: Use db.query for findMany to match return type structure if needed, or normal select
    const categories = await db.query.entryCategories.findMany({
        where: q.whereActive,
        orderBy: asc(entryCategories.sortOrder),
    });

    // Get entry counts for each category
    const { ledgerEntries } = await import("@/lib/db/schema");
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

    const categoriesWithCount = categories.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        // deletedAt is excluded by whereActive but type definition has it
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        entryCount: countMap.get(c.id) || 0,
    }));

    return categoriesWithCount;
}

/**
 * Get count of uncategorized entries (entries without a category)
 * Separated from getEntryCategoriesAction for cleaner cache management
 */
export async function getUncategorizedCountAction(ledgerId: string): Promise<number> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    const { ledgerEntries } = await import("@/lib/db/schema");

    const result = await db
        .select({
            count: sql<number>`count(*)`.as('count'),
        })
        .from(ledgerEntries)
        .where(and(
            eq(ledgerEntries.ledgerId, ledgerId),
            isNull(ledgerEntries.deletedAt),
            isNull(ledgerEntries.categoryId)
        ));

    return result[0]?.count || 0;
}
