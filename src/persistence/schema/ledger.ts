import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex,
  timestamp,
  jsonb,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";
import { type InferSelectModel, sql } from "drizzle-orm";
import { users } from "./auth";

export const ledgers = pgTable(
  "ledgers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    metadata: jsonb("metadata").$type<LedgerMetadata>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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

export const entryCategories = pgTable(
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
    isEditable: boolean("is_editable").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uniq_category_name_per_ledger")
      .on(table.ledgerId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export type EntryCategory = InferSelectModel<typeof entryCategories>;

export const ledgerEntries = pgTable(
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
    amount: numeric("amount", { precision: 20, scale: 2, mode: "string" }).notNull(),
    currency: text("currency"),
    itemName: text("item_name").notNull(),
    description: text("description"),
    convertedAmount: numeric("converted_amount", { precision: 20, scale: 2, mode: "string" }),
    exchangeRate: numeric("exchange_rate", { precision: 30, scale: 6, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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

export const serviceCredentials = pgTable(
  "service_credentials",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").unique(),
    tokenHash: text("token_hash"),
    tokenPrefix: text("token_prefix"),
    tokenSuffix: text("token_suffix"),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_service_credentials_ledger_id").on(table.ledgerId),
    uniqueIndex("uniq_service_credentials_token_hash")
      .on(table.tokenHash)
      .where(sql`${table.tokenHash} IS NOT NULL`),
  ]
);

export type ServiceCredential = InferSelectModel<typeof serviceCredentials>;
