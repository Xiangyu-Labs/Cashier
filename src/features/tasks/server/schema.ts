import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    jsonb,
    index,
} from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";
import { ledgers } from "@/features/ledger/server/schema";

// TaskRuns (任务运行记录 - 仅用于审计和前端展示)
export const taskRuns = pgTable("task_runs", {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id").references(() => ledgers.id, { onDelete: "cascade" }),

    // Task identification
    type: text("type").notNull(),               // System Name: 'parse_source_document'
    title: text("title").notNull(),             // Display Title: '解析：星巴克小票'
    bullFlowId: text("bull_flow_id"),           // BullMQ Flow ID (Root Job)

    // Result
    status: text("status").notNull().default("running"), // 'running' | 'completed' | 'failed'
    output: jsonb("output").$type<unknown>(),
    error: text("error"),

    // Statistics
    totalJobs: integer("total_jobs").default(1),        // Total task count (including children)
    completedJobs: integer("completed_jobs").default(0),
    failedJobs: integer("failed_jobs").default(0),

    // Token usage (aggregated)
    usage: jsonb("usage").$type<{ inputTokens: number; outputTokens: number; totalTokens: number }>(),

    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
}, (table) => [
    index("idx_task_runs_ledger_status").on(table.ledgerId, table.status),
    index("idx_task_runs_created_at").on(table.createdAt),
]);

export type TaskRun = InferSelectModel<typeof taskRuns>;
