"use server";
import { withLedgerAccess } from "../access";
import type {
  DeleteEntryCategoryResultDto,
  EntryCategoryDto,
  ReorderEntryCategoriesResultDto,
} from "@/modules/ledger/contracts";
import {
  parseCreateEntryCategoryInput,
  parseEntryCategoryId,
  parseReorderEntryCategoriesInput,
  parseUpdateEntryCategoryInput,
  type CreateEntryCategoryInput,
  type UpdateEntryCategoryInput,
} from "@/modules/ledger/contract-schemas";
import { getUncategorizedEntryCount } from "@/modules/ledger/application/queries/get-uncategorized-entry-count";
import { listEntryCategories } from "@/modules/ledger/application/queries/list-entry-categories";
import { createEntryCategory } from "@/modules/ledger/application/use-cases/create-entry-category";
import { deleteEntryCategory } from "@/modules/ledger/application/use-cases/delete-entry-category";
import { reorderEntryCategories } from "@/modules/ledger/application/use-cases/reorder-entry-categories";
import { updateEntryCategory } from "@/modules/ledger/application/use-cases/update-entry-category";

export const createEntryCategoryAction = withLedgerAccess(
  async (ledgerId: string, data: CreateEntryCategoryInput): Promise<EntryCategoryDto> => {
    const validated = parseCreateEntryCategoryInput(data);
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
    const validatedCategoryId = parseEntryCategoryId(categoryId);
    const validated = parseUpdateEntryCategoryInput(data);
    return updateEntryCategory(ledgerId, validatedCategoryId, validated);
  }
);

export const deleteEntryCategoryAction = withLedgerAccess(
  async (ledgerId: string, categoryId: string): Promise<DeleteEntryCategoryResultDto> => {
    const validatedCategoryId = parseEntryCategoryId(categoryId);
    const deleted = await deleteEntryCategory(ledgerId, validatedCategoryId);
    return { categoryId: validatedCategoryId, deleted };
  }
);

export const reorderEntryCategoriesAction = withLedgerAccess(
  async (ledgerId: string, categoryIds: string[]): Promise<ReorderEntryCategoriesResultDto> => {
    const validatedIds = parseReorderEntryCategoriesInput(categoryIds);
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
  async (ledgerId: string): Promise<number> => getUncategorizedEntryCount(ledgerId)
);
