import {
    sqliteTable,
    text,
    integer,
    index,
} from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { ledgers } from "@/features/ledger/server/schema";

// TaskRuns (任务运行记录 - 仅用于审计和前端展示)
export const taskRuns = sqliteTable("task_runs", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id").references(() => ledgers.id, { onDelete: "cascade" }),

    // Task identification
    type: text("type").notNull(),               // System Name: 'parse_source_document'
    title: text("title").notNull(),             // Display Title: '解析：星巴克小票'

    // Result
    status: text("status").notNull().default("pending"), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    output: text("output", { mode: "json" }).$type<unknown>(),
    error: text("error"),
    progress: text("progress"), // Current progress message

    // Statistics
    totalJobs: integer("total_jobs").default(1),        // Total task count (including children)
    completedJobs: integer("completed_jobs").default(0),
    failedJobs: integer("failed_jobs").default(0),

    // Token usage (per-model breakdown with total)
    tokenUsage: text("token_usage", { mode: "json" }).$type<{
        [model: string]: { input: number; output: number }
    }>(),

    // Timestamps
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    index("idx_task_runs_ledger_status").on(table.ledgerId, table.status),
    index("idx_task_runs_created_at").on(table.createdAt),
]);

export type TaskRun = InferSelectModel<typeof taskRuns>;
