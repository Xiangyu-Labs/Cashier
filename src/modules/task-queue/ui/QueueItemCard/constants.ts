import type { QueueItemStatus } from "@/modules/task-queue/contracts";

export const TASK_TYPE_I18N: Record<string, string> = {
  parse_source_document: "taskType_parse_source_document",
  categorize_entry: "taskType_categorize_entry",
  generate_category_metadata: "taskType_generate_category_metadata",
};

export const statusStyles: Record<QueueItemStatus, string> = {
  pending: "border-l-muted/30 bg-muted/5",
  running: "border-l-primary bg-primary/5",
  failed: "border-l-danger bg-danger/5",
  completed: "border-l-success bg-success/5",
  anomaly: "border-l-warning bg-warning/5",
};
