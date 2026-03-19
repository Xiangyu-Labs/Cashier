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

  const maxSortOrder = existingCategories.length > 0 ? (existingCategories[0].sortOrder ?? -1) : -1;
  const newSortOrder = data.sortOrder ?? maxSortOrder + 1;

  const [createdCategory] = await db
    .insert(entryCategories)
    .values({
      ...data,
      ledgerId,
      sortOrder: newSortOrder,
    })
    .returning();

  await submitCategoryMetadataTaskIfNeeded({
    ledgerId,
    categoryId: createdCategory.id,
    categoryName: createdCategory.name,
    icon: data.icon,
    description: data.description,
  });

  return mapEntryCategoryDto(createdCategory);
}
