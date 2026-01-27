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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "confirmed",
]);


export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "processing",
  "to_confirm",
  "completed",
  "failed",
  "invalid",
]);


// Ledger（账本）
export const ledgers = pgTable("ledgers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  language: text("language").notNull().default("zh-CN"),
  currencies: jsonb("currencies").$type<string[]>().default(["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  autoConfirm: boolean("auto_confirm").default(false),
  autoRecognizeDate: boolean("auto_recognize_date").default(false),
  collapsePendingDefault: boolean("collapse_pending_default").default(false),
  mergeSimilarItems: boolean("merge_similar_items").default(false),
});

export const ledgersRelations = relations(ledgers, ({ many }) => ({
  transactions: many(transactions),
  receipts: many(receipts),
}));



// Category（全局分类 -> 账本分类）
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  ledgerId: uuid("ledger_id")
    .references(() => ledgers.id, { onDelete: "cascade" }), // Nullable for compatibility/global, specific for ledger
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  ledger: one(ledgers, {
    fields: [categories.ledgerId],
    references: [ledgers.id],
  }),
  transactions: many(transactions),
}));

// Receipts (Input Messages / Queue)
export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ledgerId: uuid("ledger_id")
    .notNull()
    .references(() => ledgers.id, { onDelete: "cascade" }),

  // New flattened structure
  title: text("title"),
  text: text("text"), // Nullable, for text content
  imageUrls: jsonb("image_urls")
    .$type<string[]>()
    .default([]), // For image URLs/Base64, default empty array

  status: messageStatusEnum("status").notNull().default("queued"),
  error: text("error"),
  aiResponse: text("ai_response"),

  // Proposed transactions awaiting confirmation
  proposedTransactions: jsonb("proposed_transactions").$type<unknown[]>(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const receiptsRelations = relations(
  receipts,
  ({ one, many }) => ({
    ledger: one(ledgers, {
      fields: [receipts.ledgerId],
      references: [ledgers.id],
    }),
    transactions: many(transactions),
  })
);

// Transaction（交易记录）
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ledgerId: uuid("ledger_id")
    .notNull()
    .references(() => ledgers.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  receiptId: uuid("receipt_id").references(() => receipts.id, {
    onDelete: "set null",
  }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency"),
  itemName: text("item_name").notNull(),
  description: text("description"), // Stores the consolidated notes
  transactionDate: date("transaction_date", { mode: "date" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactionsRelations = relations(transactions, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [transactions.ledgerId],
    references: [ledgers.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  receipt: one(receipts, {
    fields: [transactions.receiptId],
    references: [receipts.id],
  }),
}));

// 预设分类

// API Keys
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(), // Store raw key for simplicity (sk_...)
  ledgerId: uuid("ledger_id")
    .notNull()
    .references(() => ledgers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [apiKeys.ledgerId],
    references: [ledgers.id],
  }),
}));
