import type { CategoryPort } from "@/application/contracts";

export async function deleteEntryCategory(
  ledgerId: string,
  categoryId: string,
  categories: Pick<CategoryPort, "delete">
): Promise<boolean> {
  return categories.delete(ledgerId, categoryId);
}
