"use server";

import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
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

export async function createEntryCategoryAction(ledgerId: string, data: z.infer<typeof createCategorySchema>) {
    try {
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return { success: false, error: "Unauthorized" };

        const validated = createCategorySchema.parse(data);
        const q = forLedger(entryCategories, ledgerId);

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

                // Dynamically import to avoid circular dependency issues or server/client boundary issues
                const { submitFlowTask } = await import("@/lib/flow/producer");
                const { TASK_TYPE_GENERATE_CATEGORY_METADATA } = await import("@/features/ledger/server/tasks/generate-category-metadata");

                await submitFlowTask({
                    type: TASK_TYPE_GENERATE_CATEGORY_METADATA,
                    title: `Generate metadata for category: ${validated.name}`,
                    ledgerId: ledgerId,
                    data: {
                        categoryId: category.id,
                        categoryName: category.name,
                        existingCategories: existing,
                        aiLanguage: "zh-CN", // Default to ZH for now, could fetch from ledger settings
                    },
                    queueName: 'api', // Use API queue for GPT calls
                });
            } catch (err) {
                logger.error({ err, ledgerId }, "Failed to submit category metadata task");
                // Don't fail the request, just log
            }
        }


        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true, data: category };
    } catch (error) {
        logger.error({ err: error, ledgerId }, "Failed to create category");
        console.error("Create Category Error:", error);
        return { success: false, error: "Failed to create category" };
    }
}

export async function updateEntryCategoryAction(ledgerId: string, categoryId: string, data: z.infer<typeof updateCategorySchema>) {
    try {
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return { success: false, error: "Unauthorized" };

        const validated = updateCategorySchema.parse(data);
        const q = forLedger(entryCategories, ledgerId);

        await db.update(entryCategories)
            .set(validated)
            .where(q.whereId(categoryId));

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ err: error, ledgerId, categoryId }, "Failed to update category");
        return { success: false, error: "Failed to update category" };
    }
}

export async function deleteEntryCategoryAction(ledgerId: string, categoryId: string) {
    try {
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return { success: false, error: "Unauthorized" };

        const q = forLedger(entryCategories, ledgerId);
        await db.update(entryCategories)
            .set(q.softDelete)
            .where(q.whereId(categoryId));

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ err: error, ledgerId, categoryId }, "Failed to delete category");
        return { success: false, error: "Failed to delete category" };
    }
}

export async function reorderEntryCategoriesAction(ledgerId: string, categoryIds: string[]) {
    try {
        const { error } = await requireLedgerAccess(ledgerId);
        if (error) return { success: false, error: "Unauthorized" };

        // Transaction for reordering
        await db.transaction(async (tx) => {
            for (let i = 0; i < categoryIds.length; i++) {
                // Ensure we only update categories belonging to this ledger
                await tx.update(entryCategories)
                    .set({ sortOrder: i })
                    .where(and(eq(entryCategories.id, categoryIds[i]), eq(entryCategories.ledgerId, ledgerId)));
            }
        });

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ err: error, ledgerId }, "Failed to reorder categories");
        return { success: false, error: "Failed to reorder categories" };
    }
}

export async function getEntryCategoriesAction(ledgerId: string) {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized");

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
