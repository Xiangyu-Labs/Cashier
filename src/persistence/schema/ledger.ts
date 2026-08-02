import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex,
  timestamp,
  jsonb,
  boolean,
  check,
  numeric,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { type InferSelectModel, sql } from "drizzle-orm";
import { users } from "./auth";

export const ledgers = pgTable(
  "ledgers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
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
    aiCustomPrompt?: string;
    timeZone?: string | null;
  };
}

export type Ledger = InferSelectModel<typeof ledgers>;

export const entryCategories = pgTable(
  "entry_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id")
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
    uniqueIndex("uq_entry_categories_ledger_id_id").on(table.ledgerId, table.id),
    uniqueIndex("uniq_category_name_per_ledger")
      .on(table.ledgerId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

export type EntryCategory = InferSelectModel<typeof entryCategories>;

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ledgerId: uuid("ledger_id")
      .notNull()
      .references(() => ledgers.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => entryCategories.id, {
      onDelete: "set null",
    }),
    sourceDocumentId: uuid("source_document_id"),
    sourceDocumentRevisionId: uuid("source_document_revision_id"),
    position: integer("position").notNull().default(0),
    amount: numeric("amount", { precision: 20, scale: 2, mode: "string" }).notNull(),
    currency: varchar("currency", { length: 3 }),
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
    uniqueIndex("uq_ledger_entries_ledger_id_id").on(table.ledgerId, table.id),
    uniqueIndex("uq_ledger_entries_revision_position").on(
      table.sourceDocumentRevisionId,
      table.position
    ),
    index("idx_ledger_entries_active_feed")
      .on(table.ledgerId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_ledger_entries_active_category")
      .on(table.ledgerId, table.categoryId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_ledger_entries_active_currency")
      .on(table.ledgerId, table.currency, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_ledger_entries_active_amount")
      .on(table.ledgerId, sql`COALESCE(${table.convertedAmount}, ${table.amount})`)
      .where(sql`${table.deletedAt} IS NULL`),
    index("idx_ledger_entries_search")
      .using(
        "gin",
        sql`lower(${table.itemName} || ' ' || COALESCE(${table.description}, '')) public.gin_trgm_ops`
      )
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      "ck_ledger_entries_currency",
      sql`${table.currency} IS NULL OR ${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check("ck_ledger_entries_position", sql`${table.position} >= 0`),
  ]
);

export type LedgerEntry = InferSelectModel<typeof ledgerEntries>;

export const serviceCredentials = pgTable(
  "service_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash"),
    tokenPrefix: text("token_prefix"),
    tokenSuffix: text("token_suffix"),
    ledgerId: uuid("ledger_id")
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
    check(
      "ck_active_service_credentials_hashed",
      sql`${table.deletedAt} IS NOT NULL OR (${table.tokenHash} IS NOT NULL AND ${table.tokenPrefix} IS NOT NULL AND ${table.tokenSuffix} IS NOT NULL)`
    ),
  ]
);

export type ServiceCredential = InferSelectModel<typeof serviceCredentials>;
