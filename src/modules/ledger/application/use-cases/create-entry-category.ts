import type { CategoryPort } from "@/application/contracts";
import type { EntryCategoryDto } from "@/modules/ledger/contracts";

interface CreateEntryCategoryInput {
  name: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
}

export async function createEntryCategory(
  ledgerId: string,
  data: CreateEntryCategoryInput,
  categories: Pick<CategoryPort, "create">
): Promise<EntryCategoryDto> {
  const created = await categories.create(ledgerId, data);
  return { ...created, deletedAt: null };
}
