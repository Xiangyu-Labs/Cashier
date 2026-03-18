import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";

export const taskRuns = sqliteTable(
  "task_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text("type").notNull(),
    title: text("title").notNull(),
    input: text("input", { mode: "json" }).$type<unknown>(),
    deduplicationKey: text("deduplication_key"),
    scopeId: text("scope_id"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "running" | "completed" | "failed" | "cancelled">(),
    error: text("error"),
    progress: text("progress"),
    tokenUsage: text("token_usage", { mode: "json" }).$type<{
      [model: string]: { input: number; output: number };
    }>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_task_runs_status").on(table.status),
    index("idx_task_runs_scope_status").on(table.scopeId, table.status),
    index("idx_task_runs_type_dedup_status").on(table.type, table.deduplicationKey, table.status),
    index("idx_task_runs_entity").on(table.entityType, table.entityId),
    index("idx_task_runs_scope_entity").on(table.scopeId, table.entityType, table.entityId),
    index("idx_task_runs_scope_status_created").on(table.scopeId, table.status, table.createdAt),
    index("idx_task_runs_created").on(table.createdAt),
  ]
);

export type TaskRun = InferSelectModel<typeof taskRuns>;
