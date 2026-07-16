import type { CategoryPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";

export async function reorderEntryCategories(
  ledgerId: string,
  categoryIds: string[],
  categories: CategoryPort = currentApplication.categories
): Promise<void> {
  await categories.reorder(ledgerId, categoryIds);
}
