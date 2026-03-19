import { db } from "@/lib/db";
import { entryCategories } from "@/persistence";
import { and, eq } from "drizzle-orm";

export async function reorderEntryCategories(ledgerId: string, categoryIds: string[]): Promise<void> {
  db.transaction((tx) => {
    for (let i = 0; i < categoryIds.length; i++) {
      tx.update(entryCategories)
        .set({ sortOrder: i })
        .where(and(eq(entryCategories.id, categoryIds[i]), eq(entryCategories.ledgerId, ledgerId)))
        .run();
    }
  });
}
