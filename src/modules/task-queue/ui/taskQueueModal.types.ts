import type { QueueItem } from "@/modules/task-queue/contracts";

export interface TaskQueueGroupedItems {
  pending: QueueItem[];
  running: QueueItem[];
  failed: QueueItem[];
  completed: QueueItem[];
  anomaly: QueueItem[];
}

export interface TaskQueueDeleteConfirmState {
  open: boolean;
  type: "single" | "all" | null;
  id: string | null;
  title: string;
  description: string;
}

export type TaskQueueRetryStatus = "failed" | "anomaly";

export const INITIAL_TASK_QUEUE_COLLAPSED_STATE = {
  pending: false,
  running: false,
  failed: false,
  anomaly: false,
  completed: true,
} as const;

export const EMPTY_TASK_QUEUE_DELETE_CONFIRM: TaskQueueDeleteConfirmState = {
  open: false,
  type: null,
  id: null,
  title: "",
  description: "",
};
