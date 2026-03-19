import { cancelFlowTask } from "@/lib/flow";
import { forLedger } from "@/lib/db/scoped-query";
import { db } from "@/lib/db";
import { entryCategories, ledgerEntries, taskRuns } from "@/persistence";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function deleteEntryCategory(ledgerId: string, categoryId: string): Promise<void> {
  const pendingTasks = await db
    .select({ id: taskRuns.id })
    .from(taskRuns)
    .where(
      and(
        eq(taskRuns.type, "generate_category_metadata"),
        inArray(taskRuns.status, ["pending", "running"]),
        isNull(taskRuns.deletedAt),
        eq(taskRuns.entityType, "category"),
        eq(taskRuns.entityId, categoryId)
      )
    );

  for (const task of pendingTasks) {
    await cancelFlowTask(task.id);
  }

  const q = forLedger(entryCategories, ledgerId);

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
}
