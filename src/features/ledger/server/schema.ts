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
    name: text("name").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<LedgerMetadata>().default({}),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    index("idx_ledgers_user_id").on(table.userId),
]);

export interface LedgerMetadata {
    settings?: {
        aiLanguage?: string;
        currencies?: string[];
        mainCurrency?: string;
        collapseEntriesDefault?: boolean;
        aiCustomPrompt?: string;
        monthStartDay?: number;      // 每月起始日 (1-31)，默认 1
        showMonthlyExpense?: boolean; // 是否显示月支出，默认 true
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
    index("idx_ledger_entries_source_doc").on(table.sourceDocumentId),
    // Optimization for default sort (createdAt) within a ledger
    index("idx_ledger_entries_ledger_created").on(table.ledgerId, table.createdAt),
    // Optimization for category filtering and grouping
    index("idx_ledger_entries_ledger_category").on(table.ledgerId, table.categoryId),
    // Optimization for amount range queries
    index("idx_ledger_entries_converted_amount").on(table.convertedAmount),
    // Optimization for tenant isolation queries
    index("idx_ledger_entries_ledger_active").on(table.ledgerId, table.deletedAt),
    // Optimization for stats queries joining with source_documents
    index("idx_ledger_entries_ledger_source_doc").on(table.ledgerId, table.sourceDocumentId),
    // Optimization for pagination with category (covering index)
    index("idx_ledger_entries_ledger_created_with_category").on(table.ledgerId, table.createdAt, table.categoryId),
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
