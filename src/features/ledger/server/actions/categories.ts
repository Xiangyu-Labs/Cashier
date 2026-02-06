"use server";

import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
//
// Server-side cache revalidation removed - client-side TanStack Query handles cache invalidation
import { z } from "zod";
import { eq, asc, and, isNull } from "drizzle-orm";
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

    const q = forLedger(entryCategories, ledgerId);
    await db.update(entryCategories)
        .set(q.softDelete)
        .where(q.whereId(categoryId));
}

export async function reorderEntryCategoriesAction(ledgerId: string, categoryIds: string[]): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    // Transaction for reordering
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

    return categories.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        // deletedAt is excluded by whereActive but type definition has it
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    }));
}
