import type { CategoryPort } from "@/application/contracts";

export async function listEntryCategoriesWithCount(ledgerId: string, categories: CategoryPort) {
  const rows = await categories.listWithCount(ledgerId);
  return rows.map((category) => ({ ...category, deletedAt: null }));
}
