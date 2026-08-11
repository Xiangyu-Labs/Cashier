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
  parseSaveEntryCategoriesInput,
  parseUpdateEntryCategoryInput,
  type CreateEntryCategoryInput,
  type UpdateEntryCategoryInput,
  type SaveEntryCategoriesInput,
} from "@/modules/ledger/contract-schemas";
import { getUncategorizedEntryCount } from "@/modules/ledger/application/queries/get-uncategorized-entry-count";
import { listEntryCategories } from "@/modules/ledger/application/queries/list-entry-categories";
import { createEntryCategory } from "@/modules/ledger/application/use-cases/create-entry-category";
import { deleteEntryCategory } from "@/modules/ledger/application/use-cases/delete-entry-category";
import { reorderEntryCategories } from "@/modules/ledger/application/use-cases/reorder-entry-categories";
import { updateEntryCategory } from "@/modules/ledger/application/use-cases/update-entry-category";
import { serverComposition } from "@/application/server-composition-root";
import { saveEntryCategories } from "@/modules/ledger/application/use-cases/save-entry-categories";

export const createEntryCategoryAction = withLedgerAccess(
  async (ledgerId: string, data: CreateEntryCategoryInput): Promise<EntryCategoryDto> => {
    const validated = parseCreateEntryCategoryInput(data);
    const payload: Parameters<typeof createEntryCategory>[1] = {
      name: validated.name,
    };
    if (validated.description !== undefined) payload.description = validated.description;
    if (validated.icon !== undefined) payload.icon = validated.icon;
    if (validated.sortOrder !== undefined) payload.sortOrder = validated.sortOrder;
    return createEntryCategory(ledgerId, payload, serverComposition.categories);
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
    return updateEntryCategory(
      ledgerId,
      validatedCategoryId,
      validated,
      serverComposition.categories
    );
  }
);

export const deleteEntryCategoryAction = withLedgerAccess(
  async (ledgerId: string, categoryId: string): Promise<DeleteEntryCategoryResultDto> => {
    const validatedCategoryId = parseEntryCategoryId(categoryId);
    const deleted = await deleteEntryCategory(
      ledgerId,
      validatedCategoryId,
      serverComposition.categories
    );
    return { categoryId: validatedCategoryId, deleted };
  }
);

export const reorderEntryCategoriesAction = withLedgerAccess(
  async (ledgerId: string, categoryIds: string[]): Promise<ReorderEntryCategoriesResultDto> => {
    const validatedIds = parseReorderEntryCategoriesInput(categoryIds);
    await reorderEntryCategories(ledgerId, validatedIds, serverComposition.categories);
    return {
      categoryIds: validatedIds,
      reorderedCount: validatedIds.length,
    };
  }
);

export const saveEntryCategoriesAction = withLedgerAccess(
  async (ledgerId: string, input: SaveEntryCategoriesInput): Promise<EntryCategoryDto[]> => {
    const validated = parseSaveEntryCategoriesInput(input);
    return saveEntryCategories(
      ledgerId,
      {
        categories: validated.categories.map((category) => ({
          ...(category.id === undefined ? {} : { id: category.id }),
          ...(category.clientId === undefined ? {} : { clientId: category.clientId }),
          name: category.name,
          description: category.description,
          icon: category.icon,
        })),
      },
      serverComposition.categories
    );
  }
);

export const getEntryCategoriesAction = withLedgerAccess((ledgerId: string) =>
  listEntryCategories(ledgerId, serverComposition.categories)
);

/**
 * Get count of uncategorized entries (entries without a category)
 * Separated from getEntryCategoriesAction for cleaner cache management
 */
export const getUncategorizedCountAction = withLedgerAccess(
  async (ledgerId: string): Promise<number> =>
    getUncategorizedEntryCount(ledgerId, serverComposition.categories)
);
