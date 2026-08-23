import type { CategoryPort } from "@/application/contracts";

export async function reorderEntryCategories(
  ledgerId: string,
  categoryIds: string[],
  categories: Pick<CategoryPort, "reorder">
): Promise<void> {
  await categories.reorder(ledgerId, categoryIds);
}
