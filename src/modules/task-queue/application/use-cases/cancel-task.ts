import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { flowEngine } from "@/lib/flow";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { sourceDocuments, taskRuns } from "@/persistence";

async function softDeleteQueuedOrProcessingSourceDocument(
  ledgerId: string,
  entityId: string | null | undefined
): Promise<void> {
  if (entityId == null || entityId === "") {
    return;
  }

  const q = forLedger(sourceDocuments, ledgerId);
  const doc = await db.query.sourceDocuments.findFirst({
    where: q.whereId(entityId),
  });

  if (doc && (doc.status === "processing" || doc.status === "queued")) {
    await db.update(sourceDocuments).set({ deletedAt: new Date() }).where(q.whereId(entityId));
  }
}

export async function cancelTaskUseCase(ledgerId: string, taskId: string): Promise<void> {
  const task = await db.query.taskRuns.findFirst({
    where: and(eq(taskRuns.id, taskId), isNull(taskRuns.deletedAt)),
  });

  if (!task) {
    throw new NotFoundError("Task");
  }

  if (task.scopeId !== ledgerId) {
    throw new ForbiddenError("Task does not belong to this ledger");
  }

  if (task.status !== "pending" && task.status !== "running") {
    throw new ValidationError(`Cannot cancel task with status '${task.status}'`);
  }

  await flowEngine.cancel(taskId);

  if (task.entityType === "source_document") {
    await softDeleteQueuedOrProcessingSourceDocument(ledgerId, task.entityId);
  }
}

export async function batchCancelTasksUseCase(
  ledgerId: string,
  taskIds: string[]
): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  const tasks = await db.query.taskRuns.findMany({
    where: and(inArray(taskRuns.id, taskIds), isNull(taskRuns.deletedAt)),
  });

  const validTasks = tasks.filter(
    (task) =>
      task.scopeId === ledgerId && (task.status === "pending" || task.status === "running")
  );

  if (validTasks.length === 0) {
    return;
  }

  await Promise.all(validTasks.map((task) => flowEngine.cancel(task.id)));

  const sourceDocTasks = validTasks.filter(
    (task) =>
      task.entityType === "source_document" && task.entityId != null && task.entityId !== ""
  );

  if (sourceDocTasks.length === 0) {
    return;
  }

  const q = forLedger(sourceDocuments, ledgerId);
  const entityIds = sourceDocTasks.map((task) => task.entityId!);
  const docs = await db.query.sourceDocuments.findMany({
    where: and(inArray(sourceDocuments.id, entityIds), q.whereActive),
  });

  const docsToDelete = docs.filter((doc) => doc.status === "processing" || doc.status === "queued");
  if (docsToDelete.length === 0) {
    return;
  }

  await db
    .update(sourceDocuments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        inArray(
          sourceDocuments.id,
          docsToDelete.map((doc) => doc.id)
        ),
        q.whereActive
      )
    );
}
