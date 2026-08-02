import type { CategoryPort } from "@/application/contracts";

export async function reorderEntryCategories(
  ledgerId: string,
  categoryIds: string[],
  categories: CategoryPort
): Promise<void> {
  await categories.reorder(ledgerId, categoryIds);
}
