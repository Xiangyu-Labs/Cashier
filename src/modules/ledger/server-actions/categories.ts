"use server";

import { db } from "@/lib/db";
import { entryCategories } from "@/persistence";
import { withLedgerAccess } from "@/lib/auth-actions";
import { forLedger } from "@/lib/db/scoped-query";
import { NotFoundError } from "@/lib/errors";
import type {
  DeleteEntryCategoryResultDto,
  EntryCategoryDto,
  ReorderEntryCategoriesResultDto,
} from "@/modules/ledger/contracts";
import { mapEntryCategoryDto } from "@/modules/ledger/mappers";
import { createEntryCategory } from "@/modules/ledger/application/use-cases/create-entry-category";
import { deleteEntryCategory } from "@/modules/ledger/application/use-cases/delete-entry-category";
import { reorderEntryCategories } from "@/modules/ledger/application/use-cases/reorder-entry-categories";
import { getUncategorizedEntryCount } from "@/modules/ledger/application/use-cases/get-uncategorized-entry-count";
import { listEntryCategories } from "@/modules/ledger/application/queries/list-entry-categories";
import {
  createEntryCategoryInputSchema,
  entryCategoryIdSchema,
  reorderEntryCategoriesInputSchema,
  updateEntryCategoryInputSchema,
  type CreateEntryCategoryInput,
  type UpdateEntryCategoryInput,
} from "@/modules/ledger/contract-schemas";

export const createEntryCategoryAction = withLedgerAccess(
  async (ledgerId: string, data: CreateEntryCategoryInput): Promise<EntryCategoryDto> => {
    const validated = createEntryCategoryInputSchema.parse(data);
    const payload: Parameters<typeof createEntryCategory>[1] = {
      name: validated.name,
    };
    if (validated.description !== undefined) payload.description = validated.description;
    if (validated.icon !== undefined) payload.icon = validated.icon;
    if (validated.sortOrder !== undefined) payload.sortOrder = validated.sortOrder;
    return createEntryCategory(ledgerId, payload);
  }
);

export const updateEntryCategoryAction = withLedgerAccess(
  async (
    ledgerId: string,
    categoryId: string,
    data: UpdateEntryCategoryInput
  ): Promise<EntryCategoryDto> => {
    const validatedCategoryId = entryCategoryIdSchema.parse(categoryId);
    const validated = updateEntryCategoryInputSchema.parse(data);
    const q = forLedger(entryCategories, ledgerId);

    const [updatedCategory] = await db
      .update(entryCategories)
      .set(validated)
      .where(q.whereId(validatedCategoryId))
      .returning();

    if (updatedCategory == null) {
      throw new NotFoundError("Category");
    }

    return mapEntryCategoryDto(updatedCategory);
  }
);

export const deleteEntryCategoryAction = withLedgerAccess(
  async (ledgerId: string, categoryId: string): Promise<DeleteEntryCategoryResultDto> => {
    const validatedCategoryId = entryCategoryIdSchema.parse(categoryId);
    const deleted = await deleteEntryCategory(ledgerId, validatedCategoryId);
    return { categoryId: validatedCategoryId, deleted };
  }
);

export const reorderEntryCategoriesAction = withLedgerAccess(
  async (ledgerId: string, categoryIds: string[]): Promise<ReorderEntryCategoriesResultDto> => {
    const validatedIds = reorderEntryCategoriesInputSchema.parse(categoryIds);
    await reorderEntryCategories(ledgerId, validatedIds);
    return {
      categoryIds: validatedIds,
      reorderedCount: validatedIds.length,
    };
  }
);

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
