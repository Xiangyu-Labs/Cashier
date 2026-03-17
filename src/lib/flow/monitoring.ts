import { logger } from "@/lib/logger";
import type { TaskRecord } from "./types";

export interface TaskMetrics {
  executionTime: number;
  queueDepth: number;
  deadTasks: string[];
}

const DEAD_TASK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export function recordTaskExecution(taskId: string, durationMs: number): void {
  logger.info({ taskId, durationMs }, "Task execution completed");

  // Log slow tasks
  if (durationMs > 60000) {
    logger.warn({ taskId, durationMs }, "Slow task detected");
  }
}

export function detectDeadTasks(tasks: TaskRecord[]): string[] {
  const now = Date.now();

  return tasks
    .filter(
      (t) =>
        t.status === "running" && now - new Date(t.updatedAt).getTime() > DEAD_TASK_THRESHOLD_MS
    )
    .map((t) => t.id);
}

export function calculateQueueDepth(tasks: TaskRecord[]): number {
  return tasks.filter((t) => t.status === "pending" || t.status === "running").length;
}
