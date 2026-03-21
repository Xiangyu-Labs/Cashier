import { db } from "@/lib/db";
import { entryCategories } from "@/persistence";
import { AppError } from "@/lib/errors";
import { and, eq, isNull } from "drizzle-orm";

export interface IndexedCategory {
  id: string;
  index: number;
  name: string;
  description: string | null;
}

export async function listIndexedCategoriesForCategorization(
  ledgerId: string
): Promise<IndexedCategory[]> {
  const categories = await db.query.entryCategories.findMany({
    where: and(eq(entryCategories.ledgerId, ledgerId), isNull(entryCategories.deletedAt)),
    orderBy: (cats, { asc }) => [asc(cats.sortOrder)],
  });

  if (categories.length === 0) {
    throw new AppError("No categories available", "NO_CATEGORIES", 404);
  }

  return categories.map((category, index) => ({
    id: category.id,
    index: index + 1,
    name: category.name,
    description: category.description,
  }));
}
