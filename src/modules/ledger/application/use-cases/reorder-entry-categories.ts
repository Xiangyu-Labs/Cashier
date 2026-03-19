import { db } from "@/lib/db";
import { entryCategories } from "@/persistence";
import { and, eq } from "drizzle-orm";

export async function reorderEntryCategories(ledgerId: string, categoryIds: string[]): Promise<void> {
  db.transaction((tx) => {
    for (const [i, categoryId] of categoryIds.entries()) {
      tx.update(entryCategories)
        .set({ sortOrder: i })
        .where(and(eq(entryCategories.id, categoryId), eq(entryCategories.ledgerId, ledgerId)))
        .run();
    }
  });
}
