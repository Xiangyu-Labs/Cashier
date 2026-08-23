import type { CategoryPort } from "@/application/contracts";

export async function listEntryCategoriesWithCount(
  ledgerId: string,
  categories: Pick<CategoryPort, "listWithCount">
) {
  const rows = await categories.listWithCount(ledgerId);
  return rows.map((category) => ({ ...category, deletedAt: null }));
}
