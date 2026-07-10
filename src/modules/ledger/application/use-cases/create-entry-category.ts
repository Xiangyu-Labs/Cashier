import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { EntryCategoryDto } from "@/modules/ledger/contracts";
import { mapEntryCategoryDto } from "@/modules/ledger/mappers";
import { entryCategories } from "@/persistence";
import { and, desc, eq, isNull } from "drizzle-orm";

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
    throw new AppError("Failed to create entry category", "ENTRY_CATEGORY_CREATION_FAILED");
  }

  return mapEntryCategoryDto(createdCategory);
}
