import type { CategoryPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";

export async function deleteEntryCategory(
  ledgerId: string,
  categoryId: string,
  categories: CategoryPort = currentApplication.categories
): Promise<boolean> {
  return categories.delete(ledgerId, categoryId);
}
