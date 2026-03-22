import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { taskRuns } from "@/persistence";

export async function dismissTaskUseCase(ledgerId: string, taskId: string): Promise<void> {
  const task = await db.query.taskRuns.findFirst({
    where: and(eq(taskRuns.id, taskId), eq(taskRuns.scopeId, ledgerId), isNull(taskRuns.deletedAt)),
  });

  if (task == null) {
    const existingTask = await db.query.taskRuns.findFirst({
      where: and(eq(taskRuns.id, taskId), isNull(taskRuns.deletedAt)),
      columns: { id: true, scopeId: true },
    });
    if (existingTask == null) {
      throw new NotFoundError("Task");
    }
    throw new ForbiddenError("Task does not belong to this ledger");
  }

  await db
    .update(taskRuns)
    .set({ deletedAt: new Date() })
    .where(and(eq(taskRuns.id, taskId), eq(taskRuns.scopeId, ledgerId), isNull(taskRuns.deletedAt)));
}

export async function batchDismissTasksUseCase(
  ledgerId: string,
  taskIds: string[]
): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  const tasks = await db.query.taskRuns.findMany({
    where: and(inArray(taskRuns.id, taskIds), eq(taskRuns.scopeId, ledgerId), isNull(taskRuns.deletedAt)),
  });
  const validTaskIds = tasks.map((task) => task.id);

  if (validTaskIds.length === 0) {
    return;
  }

  await db
    .update(taskRuns)
    .set({ deletedAt: new Date() })
    .where(
      and(
        inArray(taskRuns.id, validTaskIds),
        eq(taskRuns.scopeId, ledgerId),
        isNull(taskRuns.deletedAt)
      )
    );
}
