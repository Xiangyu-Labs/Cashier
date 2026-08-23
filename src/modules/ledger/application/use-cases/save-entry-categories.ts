import type { CategoryPort } from "@/application/contracts";
import type { EntryCategoryDto, SaveEntryCategoriesInput } from "@/modules/ledger/contracts";

export async function saveEntryCategories(
  ledgerId: string,
  input: SaveEntryCategoriesInput,
  categories: Pick<CategoryPort, "saveAll">
): Promise<EntryCategoryDto[]> {
  const saved = await categories.saveAll(
    ledgerId,
    input.categories.map((category, sortOrder) => ({ ...category, sortOrder })),
    input.expectedRevision
  );
  return saved.map((category) => ({ ...category, deletedAt: null }));
}
