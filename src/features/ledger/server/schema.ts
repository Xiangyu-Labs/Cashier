import {
    pgTable,
    uuid,
    text,
    timestamp,
    boolean,
    integer,
    decimal,
    date,
    jsonb,
    index,
    unique,
} from "drizzle-orm/pg-core";
import { users } from "@/lib/db/schemas/auth";
import { defaultLedger } from "@/config/default-ledger";

// Ledger（账本）
export const ledgers = pgTable("ledgers", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    aiLanguage: text("ai_language").notNull().default(defaultLedger.settings.aiLanguage),
    currencies: jsonb("currencies").$type<string[]>().default(defaultLedger.settings.currencies),
    mainCurrency: text("main_currency").default(defaultLedger.settings.mainCurrency),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    autoRecognizeDate: boolean("auto_recognize_date").default(defaultLedger.settings.autoRecognizeDate),
    collapseProcessingDefault: boolean("collapse_processing_default").default(defaultLedger.settings.collapseProcessingDefault),
    mergeSimilarItems: boolean("merge_similar_items").default(defaultLedger.settings.mergeSimilarItems),
    collapseBillsDefault: boolean("collapse_bills_default").default(defaultLedger.settings.collapseBillsDefault),
    aiCustomPrompt: text("ai_custom_prompt").default(defaultLedger.settings.aiCustomPrompt),
}, (table) => [
    index("idx_ledgers_user_id").on(table.userId),
]);

// EntryCategory（分录分类）
export const entryCategories = pgTable("entry_categories", {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    isEditable: boolean("is_editable").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    unique("uniq_category_name_per_ledger").on(table.ledgerId, table.name),
]);

// Note: LedgerEntries depends on SourceDocuments, but SourceDocuments depends on Ledgers
// We need to verify if we can import SourceDocuments from legacy here.
// But legacy imports ledgers. 
// If we import sourceDocuments here, legacy imports ledgers -> cycle.
// However, LedgerEntries NEEDS SourceDocumentId.
// We can use a workaround: defined the column but referencing lazily?
// Drizzle references are lazy functions: references(() => sourceDocuments.id)
// So we can import sourceDocuments from legacy.ts.
// legacy.ts imports ledgers from here.
// Is this safe?
// legacy.ts is NOT created yet.
// let's create the file assuming the import will work.

// We will add the import at the top after creating legacy.ts logic.
// For now, I'll comment out the reference or assume I can import it.
// Actually, I can decouple it? No, FK existence is important for migrations.
// I will import `sourceDocuments` from "@/lib/db/schemas/legacy".

import { sourceDocuments } from "@/lib/db/schemas/legacy";

// LedgerEntry（账目分录）
export const ledgerEntries = pgTable("ledger_entries", {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id")
        .notNull()
        .references(() => ledgers.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => entryCategories.id, {
        onDelete: "set null",
    }),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, {
        onDelete: "set null",
    }),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency"),
    itemName: text("item_name").notNull(),
    description: text("description"),
    entryDate: date("entry_date", { mode: "date" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("idx_ledger_entries_ledger_date").on(table.ledgerId, table.entryDate),
    index("idx_ledger_entries_source_doc").on(table.sourceDocumentId),
    index("idx_ledger_entries_created_at").on(table.createdAt),
]);
