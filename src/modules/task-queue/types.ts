export type QueueItemKind = "task" | "anomaly";

export type QueueItemStatus = "pending" | "running" | "failed" | "completed" | "anomaly";

export interface QueueItem {
  id: string;
  kind: QueueItemKind;
  status: QueueItemStatus;
  title: string;
  subtitle?: string;
  progress?: string;
  createdAt: string;
  entityType?: string;
  entityId?: string;
  sourceDocumentId?: string;
  taskId?: string;
  taskType?: string;
}

export interface TaskQueueStats {
  pendingCount: number;
  runningCount: number;
  failedCount: number;
  completedCount: number;
  anomalyCount: number;
  total: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgTokensPerTask: number;
}

export interface TaskQueueResult {
  items: QueueItem[];
  stats: TaskQueueStats;
}

function isSourceDocumentEntity(item: QueueItem): boolean {
  return item.entityType === "source_document" && item.entityId != null && item.entityId !== "";
}

export function hasSourceDocument(item: QueueItem): boolean {
  return item.kind === "anomaly" || isSourceDocumentEntity(item);
}

export function canRetry(item: QueueItem): boolean {
  if (!hasSourceDocument(item)) {
    return false;
  }

  if (item.kind === "task" && item.taskType !== "parse_source_document") {
    return false;
  }

  return (
    item.status === "failed" ||
    item.status === "anomaly" ||
    item.status === "pending" ||
    item.status === "completed" ||
    item.status === "running"
  );
}

export function canCancel(item: QueueItem): boolean {
  return (
    item.kind === "task" &&
    !hasSourceDocument(item) &&
    (item.status === "pending" || item.status === "running")
  );
}

export function canDelete(item: QueueItem): boolean {
  return (
    hasSourceDocument(item) &&
    (item.status === "failed" ||
      item.status === "anomaly" ||
      item.status === "pending" ||
      item.status === "running")
  );
}

export function canDismiss(item: QueueItem): boolean {
  return item.kind === "task" && item.status === "failed" && !hasSourceDocument(item);
}
