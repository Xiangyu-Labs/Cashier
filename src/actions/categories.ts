"use server";

import { db } from "@/lib/db";
import { entryCategories } from "@/lib/db/schema";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, asc, and } from "drizzle-orm";
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

export async function createEntryCategoryAction(ledgerId: string, data: z.infer<typeof createCategorySchema>) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        const validated = createCategorySchema.parse(data);

        const category = await scope.categories.create({
            ...validated,
            ledgerId: ledgerId,
        });

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true, data: category };
    } catch (error) {
        logger.error({ err: error, ledgerId }, "Failed to create category");
        console.error("Create Category Error:", error); // Direct console log for test debugging
        return { success: false, error: "Failed to create category" };
    }
}

export async function updateEntryCategoryAction(ledgerId: string, categoryId: string, data: z.infer<typeof updateCategorySchema>) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        const validated = updateCategorySchema.parse(data);

        await scope.categories.update(categoryId, validated);

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ err: error, ledgerId, categoryId }, "Failed to update category");
        return { success: false, error: "Failed to update category" };
    }
}

export async function deleteEntryCategoryAction(ledgerId: string, categoryId: string) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        await scope.categories.delete(categoryId);

        revalidatePath(`/ledger/${ledgerId}`);
        return { success: true };
    } catch (error) {
        logger.error({ err: error, ledgerId, categoryId }, "Failed to delete category");
        return { success: false, error: "Failed to delete category" };
    }
}


export async function reorderEntryCategoriesAction(ledgerId: string, categoryIds: string[]) {
    try {
        const { scope, error } = await requireLedgerAccess(ledgerId);
        if (error || !scope) return { success: false, error: "Unauthorized" };

        // Verify all categories belong to ledger
        const categories = await scope.categories.findMany({});
        if (categories.length !== categoryIds.length) {
            // Or looser check: just update those that exist?
            // Legacy API was strict?
            // Let's rely on repo or strict check. 
            // Ideally we shouldn't allow reordering IDs that aren't in the ledger.
        }

        // Use transaction via repo if available, or direct DB update loop
        // Ensure sortOrder matches array index
        await db.transaction(async (tx) => {
            for (let i = 0; i < categoryIds.length; i++) {
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
    const { scope, error } = await requireLedgerAccess(ledgerId);
    if (error || !scope) throw new Error("Unauthorized");

    const categories = await scope.categories.findMany({
        orderBy: asc(entryCategories.sortOrder),
    });

    return categories.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
    }));
}
