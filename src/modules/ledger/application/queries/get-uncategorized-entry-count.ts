import type { CategoryPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";

export async function getUncategorizedEntryCount(
  ledgerId: string,
  categories: CategoryPort = currentApplication.categories
): Promise<number> {
  return categories.countUncategorized(ledgerId);
}
