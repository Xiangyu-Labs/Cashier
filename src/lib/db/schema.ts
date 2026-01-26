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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending",
  "confirmed",
]);
export const sourceTypeEnum = pgEnum("source_type", [
  "text",
  "image",
  "mixed",
]);
export const contentTypeEnum = pgEnum("content_type", [
  "text",
  "image",
]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);


// Ledger（账本）
export const ledgers = pgTable("ledgers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ledgersRelations = relations(ledgers, ({ many }) => ({
  transactions: many(transactions),
  inputMessages: many(inputMessages),
}));

// Global Settings (全局设置)
export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  language: text("language").notNull().default("zh-CN"),
  currencies: jsonb("currencies").$type<string[]>().default(["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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

// InputMessage（原始输入）
export const inputMessages = pgTable("input_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  ledgerId: uuid("ledger_id")
    .notNull()
    .references(() => ledgers.id, { onDelete: "cascade" }),
  contentType: contentTypeEnum("content_type").notNull(),
  content: text("content").notNull(),
  status: messageStatusEnum("status").notNull().default("queued"),
  error: text("error"),
  aiResponse: text("ai_response"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const inputMessagesRelations = relations(
  inputMessages,
  ({ one, many }) => ({
    ledger: one(ledgers, {
      fields: [inputMessages.ledgerId],
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
  inputMessageId: uuid("input_message_id").references(() => inputMessages.id, {
    onDelete: "set null",
  }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency"),
  itemName: text("item_name").notNull(),
  description: text("description"),
  status: transactionStatusEnum("status").notNull().default("pending"),
  sourceType: sourceTypeEnum("source_type").notNull(),
  transactionDate: date("transaction_date", { mode: "date" }),
  metadata: jsonb("metadata"),
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
  inputMessage: one(inputMessages, {
    fields: [transactions.inputMessageId],
    references: [inputMessages.id],
  }),
}));

// 预设分类
