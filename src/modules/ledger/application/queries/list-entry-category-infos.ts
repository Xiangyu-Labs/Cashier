import type { CategoryPort } from "@/application/contracts";
import type { CategoryInfo } from "@/lib/ai/types";

export async function listEntryCategoryInfos(
  ledgerId: string,
  categories: Pick<CategoryPort, "list">
): Promise<CategoryInfo[]> {
  return (await categories.list(ledgerId)).map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
}
