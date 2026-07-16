import { currentApplication } from "@/application/current";
import type { CategoryInfo } from "@/lib/ai/types";

export async function listEntryCategoryInfos(ledgerId: string): Promise<CategoryInfo[]> {
  return (await currentApplication.categories.list(ledgerId)).map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
}
