import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";

// TaskRuns (任务运行记录 - 用于审计和前端展示)
export const taskRuns = sqliteTable(
  "task_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Task identification
    type: text("type").notNull(), // System Name: 'parse_source_document'
    title: text("title").notNull(), // Display Title: '解析：星巴克小票'

    // Input (framework-enforced complete storage)
    input: text("input", { mode: "json" }).$type<unknown>(),
    deduplicationKey: text("deduplication_key"),

    // Generic reference columns (domain-agnostic for task engine portability)
    scopeId: text("scope_id"), // Scope ID (e.g., ledgerId in Cashier)
    entityType: text("entity_type"), // Entity type (e.g., "source_document", "category")
    entityId: text("entity_id"), // Entity ID (e.g., sourceDocumentId, categoryId)

    // Result
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "running" | "completed" | "failed" | "cancelled">(),
    error: text("error"),
    progress: text("progress"), // Current progress message

    // Token usage (per-model breakdown with total)
    tokenUsage: text("token_usage", { mode: "json" }).$type<{
      [model: string]: { input: number; output: number };
    }>(),

    // Timestamps
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
    // Optimization for token stats aggregation queries with time range
    index("idx_task_runs_scope_status_created").on(table.scopeId, table.status, table.createdAt),
    // For cleaning up old tasks
    index("idx_task_runs_created").on(table.createdAt),
  ]
);

export type TaskRun = InferSelectModel<typeof taskRuns>;
