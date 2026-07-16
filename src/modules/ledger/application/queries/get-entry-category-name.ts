import { currentApplication } from "@/application/current";

export async function getEntryCategoryName(
  ledgerId: string,
  categoryId: string | null
): Promise<string> {
  if (categoryId == null || categoryId === "") return "";
  return (await currentApplication.categories.get(ledgerId, categoryId))?.name ?? "";
}
