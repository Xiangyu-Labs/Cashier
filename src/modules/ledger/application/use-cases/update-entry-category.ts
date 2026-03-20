import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { NotFoundError } from "@/lib/errors";
import { mapEntryCategoryDto } from "@/modules/ledger/application/mappers";
import type { EntryCategoryDto } from "@/modules/ledger/contracts";
import type { UpdateEntryCategoryInput } from "@/modules/ledger/contract-schemas";
import { entryCategories } from "@/persistence";

export async function updateEntryCategory(
  ledgerId: string,
  categoryId: string,
  data: UpdateEntryCategoryInput
): Promise<EntryCategoryDto> {
  const q = forLedger(entryCategories, ledgerId);
  const [updatedCategory] = await db
    .update(entryCategories)
    .set(data)
    .where(q.whereId(categoryId))
    .returning();

  if (updatedCategory == null) {
    throw new NotFoundError("Category");
  }

  return mapEntryCategoryDto(updatedCategory);
}
