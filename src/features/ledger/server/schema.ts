import {
    sqliteTable,
    text,
    integer,
    index,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { users } from "@/features/auth/server/schema";
import { type InferSelectModel, sql } from "drizzle-orm";

// Ledger（账本）
export const ledgers = sqliteTable("ledgers", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    metadata: text("metadata", { mode: "json" }).$type<LedgerMetadata>().default({}),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    index("idx_ledgers_user_id").on(table.userId),
    uniqueIndex("uniq_ledgers_user_id").on(table.userId).where(sql`${table.deletedAt} IS NULL`),
]);

export interface LedgerMetadata {
    settings?: {
        aiLanguage?: string;
        currencies?: string[];
        mainCurrency?: string;
        collapseEntriesDefault?: boolean;
        aiCustomPrompt?: string;
    };
}

export type Ledger = InferSelectModel<typeof ledgers>;

// EntryCategory（分录分类）
export const entryCategories = sqliteTable("entry_categories", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    isEditable: integer("is_editable", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    uniqueIndex("uniq_category_name_per_ledger").on(table.ledgerId, table.name).where(sql`${table.deletedAt} IS NULL`),
]);

export type EntryCategory = InferSelectModel<typeof entryCategories>;

// 延迟导入以避免循环依赖：
// - ledgerEntries.sourceDocumentId 需要引用 sourceDocuments.id
// - sourceDocuments.ledgerId 需要引用 ledgers.id
// 这是 Drizzle ORM 中处理跨模块外键的标准做法
import { sourceDocuments } from "@/features/source-document/server/schema";

// LedgerEntry（账目分录）
export const ledgerEntries = sqliteTable("ledger_entries", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => entryCategories.id, {
        onDelete: "set null",
    }),
    sourceDocumentId: text("source_document_id")
        .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    amount: text("amount").notNull(), // SQLite has no decimal, use text
    currency: text("currency"),
    itemName: text("item_name").notNull(),
    description: text("description"),
    convertedAmount: text("converted_amount"), // Amount in ledger's main currency
    exchangeRate: text("exchange_rate"), // Audit only: Exchange rate used for conversion. Not read by app queries.
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    // For looking up entries by source document (cascade delete)
    index("idx_ledger_entries_source_doc").on(table.sourceDocumentId),
    // Optimized for listing entries with soft-delete filtering and sorting
    index("idx_ledger_entries_ledger_active_created").on(table.ledgerId, table.deletedAt, table.createdAt),
    // Optimized for category filtering with soft-delete
    index("idx_ledger_entries_ledger_category_active").on(table.ledgerId, table.categoryId, table.deletedAt),
    // For amount range queries in stats
    index("idx_ledger_entries_converted_amount").on(table.convertedAmount),
]);

export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;

// ServiceCredentials (服务凭据)
export const serviceCredentials = sqliteTable("service_credentials", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull().unique(),
    ledgerId: text("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    index("idx_service_credentials_ledger_id").on(table.ledgerId),
]);

export type ServiceCredential = InferSelectModel<typeof serviceCredentials>;
