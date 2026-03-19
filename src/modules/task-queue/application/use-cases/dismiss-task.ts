import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { taskRuns } from "@/persistence";

function getLedgerIdFromTask(task: typeof taskRuns.$inferSelect): string | null {
  return task.scopeId ?? null;
}

export async function dismissTaskUseCase(ledgerId: string, taskId: string): Promise<void> {
  const task = await db.query.taskRuns.findFirst({
    where: and(eq(taskRuns.id, taskId), isNull(taskRuns.deletedAt)),
  });

  if (!task) {
    throw new NotFoundError("Task");
  }

  if (getLedgerIdFromTask(task) !== ledgerId) {
    throw new ForbiddenError("Task does not belong to this ledger");
  }

  await db.update(taskRuns).set({ deletedAt: new Date() }).where(eq(taskRuns.id, taskId));
}

export async function batchDismissTasksUseCase(
  ledgerId: string,
  taskIds: string[]
): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  const tasks = await db.query.taskRuns.findMany({
    where: and(inArray(taskRuns.id, taskIds), isNull(taskRuns.deletedAt)),
  });

  const validTaskIds = tasks
    .filter((task) => getLedgerIdFromTask(task) === ledgerId)
    .map((task) => task.id);

  if (validTaskIds.length === 0) {
    return;
  }

  await db
    .update(taskRuns)
    .set({ deletedAt: new Date() })
    .where(inArray(taskRuns.id, validTaskIds));
}
