import type { CategoryPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { NotFoundError } from "@/lib/errors";
import type { UpdateEntryCategoryInput } from "@/modules/ledger/contract-schemas";
import type { EntryCategoryDto } from "@/modules/ledger/contracts";
import { omitUndefinedProperties } from "@/lib/validation";

export async function updateEntryCategory(
  ledgerId: string,
  categoryId: string,
  data: UpdateEntryCategoryInput,
  categories: CategoryPort = currentApplication.categories
): Promise<EntryCategoryDto> {
  const updated = await categories.update(ledgerId, categoryId, omitUndefinedProperties(data));
  if (updated == null) throw new NotFoundError("Category");
  return { ...updated, deletedAt: null };
}
