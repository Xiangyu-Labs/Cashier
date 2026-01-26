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

// Ledger（账本）
export const ledgers = pgTable("ledgers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  language: text("language").notNull().default("zh-CN"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ledgersRelations = relations(ledgers, ({ many }) => ({
  categories: many(categories),
  transactions: many(transactions),
  inputMessages: many(inputMessages),
}));

// Category（分类）
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  ledgerId: uuid("ledger_id")
    .notNull()
    .references(() => ledgers.id, { onDelete: "cascade" }),
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
export const DEFAULT_CATEGORIES = [
  { name: "餐饮", description: "外卖、堂食、食材采购", icon: "🍽️", sortOrder: 1 },
  { name: "交通", description: "公交、地铁、打车、共享单车", icon: "🚗", sortOrder: 2 },
  { name: "日用品", description: "生活必需品、清洁用品", icon: "🧴", sortOrder: 3 },
  { name: "饮料", description: "咖啡、奶茶、果汁", icon: "☕", sortOrder: 4 },
  { name: "水果", description: "水果、干果", icon: "🍎", sortOrder: 5 },
  { name: "娱乐", description: "电影、游戏、订阅服务", icon: "🎮", sortOrder: 6 },
  { name: "购物", description: "服饰、电子产品、其他非必需品", icon: "🛍️", sortOrder: 7 },
];
