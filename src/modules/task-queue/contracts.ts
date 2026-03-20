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

export interface TaskQueueItemsResponseDto {
  items: QueueItem[];
}

export interface TaskQueueStatsResponseDto {
  stats: TaskQueueStats;
}
