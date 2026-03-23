import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { cancelFlowTask } from "@/lib/flow";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  deletedSourceDocumentPatch,
  whereSourceDocumentNotDeleted,
  whereSourceDocumentNotDeletedId,
} from "@/modules/source-document/queries";
import { sourceDocuments, taskRuns } from "@/persistence";

async function softDeleteQueuedOrProcessingSourceDocument(
  ledgerId: string,
  entityId: string | null | undefined
): Promise<void> {
  if (entityId == null || entityId === "") {
    return;
  }

  await db
    .update(sourceDocuments)
    .set(deletedSourceDocumentPatch())
    .where(
      and(
        whereSourceDocumentNotDeletedId(ledgerId, entityId),
        inArray(sourceDocuments.status, ["processing", "queued"])
      )
    );
}

export async function cancelTaskUseCase(ledgerId: string, taskId: string): Promise<void> {
  const task = await db.query.taskRuns.findFirst({
    where: and(
      eq(taskRuns.id, taskId),
      eq(taskRuns.scopeId, ledgerId),
      isNull(taskRuns.deletedAt),
      inArray(taskRuns.status, ["pending", "running"])
    ),
  });

  if (task == null) {
    const existingTask = await db.query.taskRuns.findFirst({
      where: and(eq(taskRuns.id, taskId), isNull(taskRuns.deletedAt)),
      columns: { id: true, scopeId: true, status: true },
    });
    if (existingTask == null) {
      throw new NotFoundError("Task");
    }
    if (existingTask.scopeId !== ledgerId) {
      throw new ForbiddenError("Task does not belong to this ledger");
    }
    throw new ValidationError(`Cannot cancel task with status '${existingTask.status}'`);
  }

  await cancelFlowTask(taskId);

  if (task.entityType === "source_document") {
    await softDeleteQueuedOrProcessingSourceDocument(ledgerId, task.entityId);
  }
}

export async function batchCancelTasksUseCase(ledgerId: string, taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) {
    return;
  }

  const tasks = await db.query.taskRuns.findMany({
    where: and(
      inArray(taskRuns.id, taskIds),
      eq(taskRuns.scopeId, ledgerId),
      isNull(taskRuns.deletedAt),
      inArray(taskRuns.status, ["pending", "running"])
    ),
  });

  if (tasks.length === 0) {
    return;
  }

  await Promise.all(tasks.map((task) => cancelFlowTask(task.id)));

  const sourceDocTasks = tasks.filter(
    (task) => task.entityType === "source_document" && task.entityId != null && task.entityId !== ""
  );

  if (sourceDocTasks.length === 0) {
    return;
  }

  const entityIds = sourceDocTasks.map((task) => task.entityId!);

  await db
    .update(sourceDocuments)
    .set(deletedSourceDocumentPatch())
    .where(
      and(
        inArray(sourceDocuments.id, entityIds),
        whereSourceDocumentNotDeleted(ledgerId),
        inArray(sourceDocuments.status, ["processing", "queued"])
      )
    );
}
