/**
 * Queue Item Card Constants
 *
 * Shared constants for queue item card styling and behavior.
 */

import type { QueueItemStatus } from "../../types";

// Task type to i18n key mapping for unified display names
export const TASK_TYPE_I18N: Record<string, string> = {
  parse_source_document: "taskType_parse_source_document",
  categorize_entry: "taskType_categorize_entry",
  generate_category_metadata: "taskType_generate_category_metadata",
};

// Status-based styling
export const statusStyles: Record<QueueItemStatus, string> = {
  pending: "border-l-muted/30 bg-muted/5",
  running: "border-l-primary bg-primary/5",
  failed: "border-l-red-500 bg-red-50/50 dark:bg-red-900/10",
  completed: "border-l-green-500 bg-green-50/50 dark:bg-green-900/10",
  anomaly: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10",
};
