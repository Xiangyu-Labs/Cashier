/**
 * Unified Queue Item Types
 *
 * This module defines the unified data structure for the Task Queue UI.
 * It abstracts over both task_runs (tasks) and source_documents (anomalies)
 * to provide a consistent interface for the queue card component.
 */

/**
 * Discriminant for the source of the queue item
 */
export type QueueItemKind = "task" | "anomaly";

/**
 * Unified status enum covering task statuses and anomaly status
 */
export type QueueItemStatus = "pending" | "running" | "failed" | "completed" | "anomaly";

/**
 * Unified queue item for display in TaskQueueModal
 *
 * This interface normalizes data from two sources:
 * - task_runs table (kind: 'task')
 * - source_documents table with status='anomaly' (kind: 'anomaly')
 */
export interface QueueItem {
  /** Unique identifier - taskId for tasks, sourceDocumentId for anomalies */
  id: string;

  /** Discriminant indicating the data source */
  kind: QueueItemKind;

  /** Current status of the item */
  status: QueueItemStatus;

  /** Display title */
  title: string;

  /** Secondary info shown in collapsed state: error message or anomaly reason */
  subtitle?: string;

  /** Progress message (only for running status) */
  progress?: string;

  /** ISO timestamp of creation */
  createdAt: string;

  // --- Action-related fields ---

  /**
   * Source document ID for operations like edit-retry.
   * - For kind='task': extracted from input.sourceDocumentId
   * - For kind='anomaly': same as id
   */
  sourceDocumentId?: string;

  /**
   * Task ID for operations like cancel/dismiss.
   * - For kind='task': same as id
   * - For kind='anomaly': undefined (no task to cancel)
   */
  taskId?: string;

  /**
   * Task type for determining available actions.
   * E.g., 'parse_source_document' supports edit-retry.
   */
  taskType?: string;
}

/**
 * Helper to check if an item supports source document operations
 * (edit-retry, view original input)
 */
export function hasSourceDocument(item: QueueItem): boolean {
  return item.sourceDocumentId !== undefined;
}

/**
 * Helper to check if an item supports retry operations
 */
export function canRetry(item: QueueItem): boolean {
  // Tasks with source documents can be retried
  // Anomalies can be retried
  return item.sourceDocumentId !== undefined;
}

/**
 * Helper to check if an item supports cancel operation
 */
export function canCancel(item: QueueItem): boolean {
  // Only pending/running tasks can be cancelled
  // Anomalies have no running task to cancel
  return item.kind === "task" && (item.status === "pending" || item.status === "running");
}

/**
 * Helper to check if an item supports delete operation
 */
export function canDelete(item: QueueItem): boolean {
  // Failed/running tasks with source docs, anomalies can be deleted
  // Pending tasks with source docs can also be deleted
  return (
    item.sourceDocumentId !== undefined &&
    (item.status === "failed" ||
      item.status === "anomaly" ||
      item.status === "pending" ||
      item.status === "running")
  );
}

/**
 * Helper to check if an item supports dismiss operation
 * (for non-source-document tasks like category generation)
 */
export function canDismiss(item: QueueItem): boolean {
  // Only failed tasks without source document can be dismissed
  return item.kind === "task" && item.status === "failed" && item.sourceDocumentId === undefined;
}
