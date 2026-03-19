import { db } from "@/lib/db";
import type { CategoryInfo } from "@/lib/ai/types";

export async function listEntryCategoryInfos(ledgerId: string): Promise<CategoryInfo[]> {
  return db.query.entryCategories.findMany({
    where: (table, { eq, or, isNull, and }) =>
      and(or(eq(table.ledgerId, ledgerId), isNull(table.ledgerId)), isNull(table.deletedAt)),
    columns: {
      id: true,
      name: true,
      description: true,
    },
    orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.id)],
  });
}
