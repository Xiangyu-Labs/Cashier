import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { type InferSelectModel, sql } from "drizzle-orm";
import { users } from "./auth";

export const ledgers = sqliteTable(
  "ledgers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metadata: text("metadata", { mode: "json" }).$type<LedgerMetadata>().default({}),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_ledgers_user_id").on(table.userId),
    uniqueIndex("uniq_ledgers_user_id")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

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

export const entryCategories = sqliteTable(
  "entry_categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    isEditable: integer("is_editable", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("uniq_category_name_per_ledger")
      .on(table.ledgerId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export type EntryCategory = InferSelectModel<typeof entryCategories>;

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => entryCategories.id, {
      onDelete: "set null",
    }),
    sourceDocumentId: text("source_document_id"),
    // Nullable compatibility projection. Existing ledger reads continue to use sourceDocumentId.
    sourceDocumentRevisionId: text("source_document_revision_id"),
    amount: text("amount").notNull(),
    currency: text("currency"),
    itemName: text("item_name").notNull(),
    description: text("description"),
    convertedAmount: text("converted_amount"),
    exchangeRate: text("exchange_rate"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_ledger_entries_source_doc").on(table.sourceDocumentId),
    uniqueIndex("uq_ledger_entries_ledger_id_id").on(table.ledgerId, table.id),
    index("idx_ledger_entries_ledger_revision").on(table.ledgerId, table.sourceDocumentRevisionId),
    index("idx_ledger_entries_ledger_active_created").on(
      table.ledgerId,
      table.deletedAt,
      table.createdAt
    ),
    index("idx_ledger_entries_ledger_category_active").on(
      table.ledgerId,
      table.categoryId,
      table.deletedAt
    ),
    index("idx_ledger_entries_ledger_currency").on(table.ledgerId, table.currency, table.deletedAt),
  ]
);

export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;

export const serviceCredentials = sqliteTable(
  "service_credentials",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull().unique(),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_service_credentials_ledger_id").on(table.ledgerId)]
);

export type ServiceCredential = InferSelectModel<typeof serviceCredentials>;
