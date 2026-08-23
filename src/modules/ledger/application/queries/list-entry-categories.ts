import { listEntryCategoriesWithCount } from "@/modules/ledger/application/use-cases/list-entry-categories-with-count";
import type { EntryCategoryWithCountDto } from "@/modules/ledger/contracts";
import type { CategoryPort } from "@/application/contracts";

export async function listEntryCategories(
  ledgerId: string,
  categories: Pick<CategoryPort, "listWithCount">
): Promise<EntryCategoryWithCountDto[]> {
  return listEntryCategoriesWithCount(ledgerId, categories);
}
