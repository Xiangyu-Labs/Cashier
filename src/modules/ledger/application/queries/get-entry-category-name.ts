import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { entryCategories } from "@/persistence";

export async function getEntryCategoryName(categoryId: string | null): Promise<string> {
  if (categoryId == null || categoryId === "") {
    return "";
  }

  const category = await db.query.entryCategories.findFirst({
    where: and(eq(entryCategories.id, categoryId), isNull(entryCategories.deletedAt)),
    columns: { name: true },
  });

  return category?.name ?? "";
}
