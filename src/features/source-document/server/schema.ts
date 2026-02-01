import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    index,
    pgEnum,
} from "drizzle-orm/pg-core";
import { ledgers } from "@/features/ledger/server/schema";
import { type InferSelectModel } from "drizzle-orm";

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
        .default([])
        .notNull(),

    status: sourceDocumentStatusEnum("status").notNull().default("queued"),
    anomalyCodes: jsonb("anomaly_codes").$type<string[]>().default([]),
    metadata: jsonb("metadata").$type<SourceDocMetadata>().default({}),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
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
