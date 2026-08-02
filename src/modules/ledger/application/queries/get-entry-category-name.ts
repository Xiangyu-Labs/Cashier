import type { CategoryPort } from "@/application/contracts";

export async function getEntryCategoryName(
  ledgerId: string,
  categoryId: string | null,
  categories: CategoryPort
): Promise<string> {
  if (categoryId == null || categoryId === "") return "";
  return (await categories.get(ledgerId, categoryId))?.name ?? "";
}
