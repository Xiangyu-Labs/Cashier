import {
    pgTable,
    uuid,
    text,
    timestamp,
    boolean,
    integer,
    jsonb,
    date,
    index,
    primaryKey,
    pgEnum,
    unique,
} from "drizzle-orm/pg-core";
import { ledgers } from "@/features/ledger/server/schema";

// Enums
export const sourceDocumentStatusEnum = pgEnum("source_document_status", [
    "queued",
    "processing",
    "completed",
    "anomaly",
]);

export const anomalyCodeEnum = pgEnum("anomaly_code", [
    "internal_error",
    "invalid_content",
    "evidence_anomaly",
    "unknown_currency",
]);

// SourceDocuments (原始凭证)
export const sourceDocuments = pgTable("source_documents", {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),

    title: text("title"),
    text: text("text"),
    imageUrls: jsonb("image_urls")
        .$type<string[]>()
        .default([]),

    status: sourceDocumentStatusEnum("status").notNull().default("queued"),
    anomalyCodes: jsonb("anomaly_codes").$type<string[]>().default([]),

    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("idx_source_docs_ledger_status").on(table.ledgerId, table.status),
    index("idx_source_docs_ledger_created").on(table.ledgerId, table.createdAt),
]);

// Shares (分享链接)
export const shares = pgTable("shares", {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceDocumentId: uuid("source_document_id")
        .notNull()
        .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    ledgerId: uuid("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),  // null = never expires
    isActive: boolean("is_active").notNull().default(true),
    accessCount: integer("access_count").notNull().default(0),
}, (table) => [
    index("idx_shares_source_doc").on(table.sourceDocumentId),
    index("idx_shares_ledger").on(table.ledgerId),
]);

// Share Access Logs (分享访问审计日志)
export const shareAccessLogs = pgTable("share_access_logs", {
    id: uuid("id").primaryKey().defaultRandom(),
    shareId: uuid("share_id")
        .notNull()
        .references(() => shares.id, { onDelete: "cascade" }),
    accessedAt: timestamp("accessed_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    referer: text("referer"),
}, (table) => [
    index("idx_share_access_logs_share_id").on(table.shareId),
    index("idx_share_access_logs_accessed_at").on(table.accessedAt),
]);

// ServiceCredentials (服务凭据)
export const serviceCredentials = pgTable("service_credentials", {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    ledgerId: uuid("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
});

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

// CurrencyRates (汇率缓存 - Daily Snapshot)
export const currencyRates = pgTable("currency_rates", {
    date: date("date", { mode: "string" }).primaryKey(), // YYYY-MM-DD
    base: text("base").notNull().default("EUR"), // Always EUR from Frankfurter
    rates: jsonb("rates").$type<Record<string, number>>().notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
