import {
    pgTable,
    uuid,
    text,
    timestamp,
    boolean,
    integer,
    index,
} from "drizzle-orm/pg-core";
import { ledgers } from "@/features/ledger/server/schema";
import { sourceDocuments } from "@/features/source-document/server/schema";
import { type InferSelectModel } from "drizzle-orm";

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

export type Share = InferSelectModel<typeof shares>;

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

export type ShareAccessLog = InferSelectModel<typeof shareAccessLogs>;
