import { forLedger } from "@/lib/db/scoped-query";
import { db } from "@/lib/db";
import { entryCategories, ledgerEntries } from "@/persistence";
import { and, eq, isNull } from "drizzle-orm";

export async function deleteEntryCategory(ledgerId: string, categoryId: string): Promise<boolean> {
  const q = forLedger(entryCategories, ledgerId);
  const existingCategory = await db.query.entryCategories.findFirst({
    where: q.whereId(categoryId),
    columns: { id: true },
  });

  if (existingCategory == null) {
    return false;
  }

  db.transaction((tx) => {
    tx.update(ledgerEntries)
      .set({ categoryId: null })
      .where(
        and(
          eq(ledgerEntries.ledgerId, ledgerId),
          eq(ledgerEntries.categoryId, categoryId),
          isNull(ledgerEntries.deletedAt)
        )
      )
      .run();

    tx.update(entryCategories).set(q.softDelete).where(q.whereId(categoryId)).run();
  });

  return true;
}
