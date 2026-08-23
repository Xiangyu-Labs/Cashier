import type { CategoryPort } from "@/application/contracts";

export async function getUncategorizedEntryCount(
  ledgerId: string,
  categories: Pick<CategoryPort, "countUncategorized">
): Promise<number> {
  return categories.countUncategorized(ledgerId);
}
