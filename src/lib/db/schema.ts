import {
  pgTable,
  uuid,
  text,
  timestamp,
  decimal,
  integer,
  pgEnum,
  date,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import defaultLedger from "@/config/default-ledger.json";

// Enums
export const ledgerEntryStatusEnum = pgEnum("ledger_entry_status", [
  "pending",
  "confirmed",
]);


export const sourceDocumentStatusEnum = pgEnum("source_document_status", [
  "queued",
  "processing",
  "to_confirm",
  "completed",
  "error",
]);

export const errorCodeEnum = pgEnum("error_code", [
  "internal_error",
  "parse_failed",
  "invalid_content",
]);



// Ledger（账本）
export const ledgers = pgTable("ledgers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  language: text("language").notNull().default(defaultLedger.settings.language),
  currencies: jsonb("currencies").$type<string[]>().default(defaultLedger.settings.currencies),
  mainCurrency: text("main_currency").default(defaultLedger.settings.mainCurrency),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  autoConfirm: boolean("auto_confirm").default(defaultLedger.settings.autoConfirm),
  autoRecognizeDate: boolean("auto_recognize_date").default(defaultLedger.settings.autoRecognizeDate),
  collapsePendingDefault: boolean("collapse_pending_default").default(defaultLedger.settings.collapsePendingDefault),
  mergeSimilarItems: boolean("merge_similar_items").default(defaultLedger.settings.mergeSimilarItems),
});

export const ledgersRelations = relations(ledgers, ({ many }) => ({
  ledgerEntries: many(ledgerEntries),
  sourceDocuments: many(sourceDocuments),
}));



// EntryCategory（分录分类）
export const entryCategories = pgTable("entry_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  ledgerId: uuid("ledger_id")
    .references(() => ledgers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  isEditable: boolean("is_editable").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const entryCategoriesRelations = relations(entryCategories, ({ one, many }) => ({
  ledger: one(ledgers, {
    fields: [entryCategories.ledgerId],
    references: [ledgers.id],
  }),
  ledgerEntries: many(ledgerEntries),
}));

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
  errorCode: errorCodeEnum("error_code"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_source_docs_ledger_status").on(table.ledgerId, table.status),
  index("idx_source_docs_ledger_created").on(table.ledgerId, table.createdAt),
]);

export const sourceDocumentsRelations = relations(
  sourceDocuments,
  ({ one, many }) => ({
    ledger: one(ledgers, {
      fields: [sourceDocuments.ledgerId],
      references: [ledgers.id],
    }),
    ledgerEntries: many(ledgerEntries),
  })
);

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
  status: ledgerEntryStatusEnum("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_ledger_entries_ledger_date").on(table.ledgerId, table.entryDate),
  index("idx_ledger_entries_source_doc").on(table.sourceDocumentId),
  index("idx_ledger_entries_created_at").on(table.createdAt),
  index("idx_ledger_entries_status").on(table.ledgerId, table.status),
]);

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [ledgerEntries.ledgerId],
    references: [ledgers.id],
  }),
  category: one(entryCategories, {
    fields: [ledgerEntries.categoryId],
    references: [entryCategories.id],
  }),
  sourceDocument: one(sourceDocuments, {
    fields: [ledgerEntries.sourceDocumentId],
    references: [sourceDocuments.id],
  }),
}));

// 预设分类

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

export const serviceCredentialsRelations = relations(serviceCredentials, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [serviceCredentials.ledgerId],
    references: [ledgers.id],
  }),
}));

// ProcessingTasks (处理任务)
export const processingTasks = pgTable("processing_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),

  type: text("type").notNull(),
  title: text("title").notNull(),
  ledgerId: uuid("ledger_id").references(() => ledgers.id, { onDelete: "cascade" }),

  entityId: uuid("entity_id"),
  entityType: text("entity_type"),

  status: text("status").notNull().default("queued"),
  error: text("error"),

  input: jsonb("input").$type<unknown>(),
  output: jsonb("output").$type<unknown>(),
  progress: jsonb("progress").$type<TaskProgress>(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_processing_tasks_ledger_status").on(table.ledgerId, table.status),
  index("idx_processing_tasks_created_at").on(table.createdAt),
]);

// Type for progress tracking (flexible structure)
export interface TaskProgress {
  currentStep?: string;      // Current step name
  completedSteps?: string[]; // List of completed steps
  totalSteps?: number;       // Optional: total steps count
  data?: unknown;            // Step-specific intermediate data
}

export const processingTasksRelations = relations(processingTasks, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [processingTasks.ledgerId],
    references: [ledgers.id],
  }),
}));

// CurrencyRates (汇率缓存 - Daily Snapshot)
// Strategy: Store the entire rate list (base EUR) for a specific date.
// This allows offline calculation of ANY currency pair for that date using Cross-Rate:
// Rate(A->B) = Rate(EUR->B) / Rate(EUR->A)
export const currencyRates = pgTable("currency_rates", {
  date: date("date", { mode: "string" }).primaryKey(), // YYYY-MM-DD
  base: text("base").notNull().default("EUR"), // Always EUR from Frankfurter
  rates: jsonb("rates").$type<Record<string, number>>().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
