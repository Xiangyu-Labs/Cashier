import type { EntryCategoryWithCountDto } from "@/modules/ledger/contracts";
import type { CategoryPort } from "@/application/contracts";

export async function listEntryCategories(
  ledgerId: string,
  categories: Pick<CategoryPort, "listWithCount">
): Promise<EntryCategoryWithCountDto[]> {
  const rows = await categories.listWithCount(ledgerId);
  return rows.map((category) => ({ ...category, deletedAt: null }));
}
