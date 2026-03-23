import type { QueueItem, TaskQueueStats } from "@/modules/task-queue/contracts";
import type { TaskQueueGroupedItems } from "./taskQueueModal.types";

function isNonEmptyId(value: string | null | undefined): value is string {
  return typeof value === "string" && value !== "";
}

export function groupTaskQueueItems(items: QueueItem[]): TaskQueueGroupedItems {
  const groupedItems: TaskQueueGroupedItems = {
    pending: [],
    running: [],
    failed: [],
    completed: [],
    anomaly: [],
  };

  for (const item of items) {
    groupedItems[item.status].push(item);
  }

  return groupedItems;
}

export function partitionFailedItems(items: QueueItem[]) {
  return {
    withSourceDoc: items.filter((item) => isNonEmptyId(item.sourceDocumentId)),
    withoutSourceDoc: items.filter((item) => !isNonEmptyId(item.sourceDocumentId)),
  };
}

export function collectSourceDocumentIds(items: QueueItem[]): string[] {
  return items.map((item) => item.sourceDocumentId).filter(isNonEmptyId);
}

export function collectTaskIds(items: QueueItem[]): string[] {
  return items.map((item) => item.taskId).filter(isNonEmptyId);
}

export function isTaskQueueEmpty(
  stats: TaskQueueStats,
  groupedItems: TaskQueueGroupedItems
): boolean {
  return stats.total === 0 && groupedItems.completed.length === 0;
}
