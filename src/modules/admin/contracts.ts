import type { z } from "zod";
import type {
  listAdminTasksInputSchema,
  listAdminTasksValidatedInputSchema,
} from "./contract-schemas";

export type AdminTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type AdminTaskRange = "24h" | "7d" | "30d" | "all";

export interface AdminTaskListItem {
  id: string;
  status: AdminTaskStatus;
  type: string;
  title: string;
  progress: string | null;
  error: string | null;
  scopeId: string | null;
  scopeUserEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ListAdminTasksResult {
  items: AdminTaskListItem[];
  nextCursor: string | null;
  availableTypes: string[];
  hasAnyTasks: boolean;
}

export type ListAdminTasksInput = z.input<typeof listAdminTasksInputSchema>;
export type ListAdminTasksValidatedInput = z.infer<typeof listAdminTasksValidatedInputSchema>;
