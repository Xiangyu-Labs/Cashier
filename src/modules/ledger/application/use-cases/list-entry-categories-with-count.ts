import type { CategoryPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";

export async function listEntryCategoriesWithCount(
  ledgerId: string,
  categories: CategoryPort = currentApplication.categories
) {
  const rows = await categories.listWithCount(ledgerId);
  return rows.map((category) => ({ ...category, deletedAt: null }));
}
