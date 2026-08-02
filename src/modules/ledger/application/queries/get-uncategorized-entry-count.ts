import type { CategoryPort } from "@/application/contracts";

export async function getUncategorizedEntryCount(
  ledgerId: string,
  categories: CategoryPort
): Promise<number> {
  return categories.countUncategorized(ledgerId);
}
