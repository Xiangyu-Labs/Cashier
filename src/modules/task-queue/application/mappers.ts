import { z } from "zod";
import type { TaskRun, SourceDocument } from "@/persistence";
import type { QueueItem, QueueItemStatus } from "@/modules/task-queue/types";

const QueueItemStatusSchema = z.enum(["pending", "running", "completed", "failed", "anomaly"]);

export function getSourceDocumentId(
  task: Pick<TaskRun, "entityType" | "entityId">
): string | undefined {
  if (task.entityType !== "source_document" || task.entityId == null || task.entityId === "") {
    return undefined;
  }

  return task.entityId;
}

export function taskRunToQueueItem(task: TaskRun, sourceDocTitle?: string | null): QueueItem {
  const sourceDocumentId = getSourceDocumentId(task);
  const parsedStatus = QueueItemStatusSchema.safeParse(task.status);
  const status: QueueItemStatus = parsedStatus.success ? parsedStatus.data : "failed";

  let title = task.title;
  if (
    status === "completed" &&
    task.type === "parse_source_document" &&
    typeof sourceDocTitle === "string"
  ) {
    title = `解析原始凭证：${sourceDocTitle}`;
  }

  return {
    id: task.id,
    kind: "task",
    status,
    title,
    createdAt: task.createdAt.toISOString(),
    taskId: task.id,
    taskType: task.type,
    ...(task.error !== null ? { subtitle: task.error } : {}),
    ...(task.progress !== null ? { progress: task.progress } : {}),
    ...(task.entityType !== null ? { entityType: task.entityType } : {}),
    ...(task.entityId !== null ? { entityId: task.entityId } : {}),
    ...(sourceDocumentId !== undefined ? { sourceDocumentId } : {}),
  };
}

export function anomalyDocToQueueItem(doc: SourceDocument): QueueItem {
  return {
    id: doc.id,
    kind: "anomaly",
    status: "anomaly",
    title: doc.title ?? "Untitled Source Document",
    createdAt: doc.createdAt.toISOString(),
    entityType: "source_document",
    entityId: doc.id,
    sourceDocumentId: doc.id,
    ...(doc.anomalyReason !== null ? { subtitle: doc.anomalyReason } : {}),
  };
}
