import type { CategoryPort } from "@/application/contracts";

export async function deleteEntryCategory(
  ledgerId: string,
  categoryId: string,
  categories: CategoryPort
): Promise<boolean> {
  return categories.delete(ledgerId, categoryId);
}
