import type { QueueItem } from "./contracts";

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
