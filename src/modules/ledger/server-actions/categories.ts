"use server";

import { db } from "@/lib/db";
import { entryCategories } from "@/persistence";
import { z } from "zod";
import { withLedgerAccess } from "@/lib/auth-actions";
import { forLedger } from "@/lib/db/scoped-query";
import type { EntryCategoryDto } from "@/modules/ledger/contracts";
import { createEntryCategory } from "@/modules/ledger/application/use-cases/create-entry-category";
import { deleteEntryCategory } from "@/modules/ledger/application/use-cases/delete-entry-category";
import { reorderEntryCategories } from "@/modules/ledger/application/use-cases/reorder-entry-categories";
import { listEntryCategoriesWithCount } from "@/modules/ledger/application/use-cases/list-entry-categories-with-count";
import { getUncategorizedEntryCount } from "@/modules/ledger/application/use-cases/get-uncategorized-entry-count";

const createCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

const updateCategorySchema = createCategorySchema.partial().extend({
  sortOrder: z.number().optional(),
});

export const createEntryCategoryAction = withLedgerAccess(
  async (
    ledgerId: string,
    data: z.infer<typeof createCategorySchema>
  ): Promise<EntryCategoryDto> => {
    const validated = createCategorySchema.parse(data);
    return createEntryCategory(ledgerId, validated);
  }
);

export const updateEntryCategoryAction = withLedgerAccess(
  async (
    ledgerId: string,
    categoryId: string,
    data: z.infer<typeof updateCategorySchema>
  ): Promise<void> => {
    const validated = updateCategorySchema.parse(data);
    const q = forLedger(entryCategories, ledgerId);

    await db.update(entryCategories).set(validated).where(q.whereId(categoryId));
  }
);

export const deleteEntryCategoryAction = withLedgerAccess(
  async (ledgerId: string, categoryId: string): Promise<void> => {
    await deleteEntryCategory(ledgerId, categoryId);
  }
);

export const reorderEntryCategoriesAction = withLedgerAccess(
  async (ledgerId: string, categoryIds: string[]): Promise<void> => {
    await reorderEntryCategories(ledgerId, categoryIds);
  }
);

export async function listEntryCategories(ledgerId: string) {
  return listEntryCategoriesWithCount(ledgerId);
}

export const getEntryCategoriesAction = withLedgerAccess(listEntryCategories);

/**
 * Get count of uncategorized entries (entries without a category)
 * Separated from getEntryCategoriesAction for cleaner cache management
 */
export const getUncategorizedCountAction = withLedgerAccess(
  async (ledgerId: string): Promise<number> => {
    return getUncategorizedEntryCount(ledgerId);
  }
);
