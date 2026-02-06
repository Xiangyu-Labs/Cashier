import {
    sqliteTable,
    text,
    integer,
    index,
} from "drizzle-orm/sqlite-core";
import { ledgers } from "@/features/ledger/server/schema";
import { type InferSelectModel } from "drizzle-orm";

// Enums (Managed in application layer for SQLite)
export const SourceDocumentStatus = {
    Queued: "queued",
    Processing: "processing",
    Completed: "completed",
    Anomaly: "anomaly",
} as const;

// SourceDocuments (原始凭证)
export const sourceDocuments = sqliteTable("source_documents", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),

    title: text("title"),
    text: text("text"),
    imageUrls: text("image_urls", { mode: "json" })
        .$type<string[]>()
        .default([]),

    status: text("status").notNull().default("queued"),
    anomalyReason: text("anomaly_reason"),  // 异常原因（直接显示给用户）
    entryDate: text("entry_date"),  // 交易日期 yyyy-MM-dd 格式
    metadata: text("metadata", { mode: "json" }).$type<SourceDocMetadata>().default({}),

    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    index("idx_source_docs_ledger_status").on(table.ledgerId, table.status),
    index("idx_source_docs_ledger_created").on(table.ledgerId, table.createdAt),
]);

export interface SourceDocMetadata {
    rawOcrText?: string;
    aiRawResponse?: unknown;
    emailHeaders?: {
        from?: string;
        subject?: string;
        messageId?: string;
    };
    fileMeta?: {
        sizeBytes?: number;
        mimeType?: string;
        originalName?: string;
    };
}

export type SourceDocument = InferSelectModel<typeof sourceDocuments>;
