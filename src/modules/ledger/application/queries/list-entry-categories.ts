import { listEntryCategoriesWithCount } from "@/modules/ledger/application/use-cases/list-entry-categories-with-count";
import type { EntryCategoryWithCountDto } from "@/modules/ledger/contracts";

export async function listEntryCategories(ledgerId: string): Promise<EntryCategoryWithCountDto[]> {
  return listEntryCategoriesWithCount(ledgerId);
}
