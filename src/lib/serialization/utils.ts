import { z } from "zod";
import type { TaskRun } from "@/persistence/schema/task-queue";
import type { SerializedTask } from "./types";

const TaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);

function serializeDate(date: Date | null | undefined): string | null {
  if (date == null) return null;
  return date.toISOString();
}

export function serializeDates<
  T extends { createdAt: Date; updatedAt: Date; deletedAt: Date | null },
>(row: T) {
  return {
    ...row,
    createdAt: serializeDate(row.createdAt)!,
    updatedAt: serializeDate(row.updatedAt)!,
    deletedAt: serializeDate(row.deletedAt),
  };
}

export function serializeTask(task: TaskRun): SerializedTask {
  return {
    id: task.id,
    type: task.type,
    title: task.title,
    input: task.input,
    deduplicationKey: task.deduplicationKey ?? null,
    scopeId: task.scopeId,
    entityType: task.entityType,
    entityId: task.entityId,
    status: TaskStatusSchema.parse(task.status),
    error: task.error,
    progress: task.progress,
    tokenUsage: task.tokenUsage,
    createdAt: serializeDate(task.createdAt)!,
    updatedAt: serializeDate(task.updatedAt)!,
    startedAt: serializeDate(task.startedAt),
    completedAt: serializeDate(task.completedAt),
  };
}
