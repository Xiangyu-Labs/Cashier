import type { z } from "zod";
import type {
  listAdminTasksInputSchema,
  listAdminTasksValidatedInputSchema,
} from "./contract-schemas";
import type { UserRoleValue } from "./types";

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

export interface AdminTaskDetail {
  id: string;
  status: AdminTaskStatus;
  type: string;
  title: string;
  input: unknown;
  deduplicationKey: string | null;
  scopeId: string | null;
  scopeUserEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  error: string | null;
  progress: string | null;
  tokenUsage: unknown;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  deletedAt: Date | null;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  emailVerified: Date | null;
  image: string | null;
  role: UserRoleValue;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ListAdminTasksResult {
  items: AdminTaskListItem[];
  nextCursor: string | null;
  availableTypes: string[];
  hasAnyTasks: boolean;
}

export type ListAdminTasksInput = z.input<typeof listAdminTasksInputSchema>;
export type ListAdminTasksValidatedInput = z.infer<typeof listAdminTasksValidatedInputSchema>;
