import { db } from "@/lib/db";
import type { EntryCategoryDto } from "@/modules/ledger/contracts";
import { mapEntryCategoryDto } from "@/modules/ledger/mappers";
import { entryCategories } from "@/persistence";
import { and, desc, eq, isNull } from "drizzle-orm";
import { submitCategoryMetadataTaskIfNeeded } from "@/modules/ledger/application/services/category-metadata-task";

interface CreateEntryCategoryInput {
  name: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
}

export async function createEntryCategory(
  ledgerId: string,
  data: CreateEntryCategoryInput
): Promise<EntryCategoryDto> {
  const existingCategories = await db.query.entryCategories.findMany({
    where: and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)),
    columns: { sortOrder: true },
    orderBy: desc(entryCategories.sortOrder),
    limit: 1,
  });

  const firstCategory = existingCategories[0];
  const maxSortOrder = firstCategory?.sortOrder ?? -1;
  const newSortOrder = data.sortOrder ?? maxSortOrder + 1;

  const [createdCategory] = await db
    .insert(entryCategories)
    .values({
      ...data,
      ledgerId,
      sortOrder: newSortOrder,
    })
    .returning();

  if (createdCategory == null) {
    throw new Error("Failed to create entry category");
  }

  await submitCategoryMetadataTaskIfNeeded({
    ledgerId,
    categoryId: createdCategory.id,
    categoryName: createdCategory.name,
    ...(data.icon !== undefined ? { icon: data.icon } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
  });

  return mapEntryCategoryDto(createdCategory);
}
