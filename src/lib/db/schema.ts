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
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import defaultLedger from "@/config/default-ledger.json";

// ==========================================
// Enums
// ==========================================

export const sourceDocumentStatusEnum = pgEnum("source_document_status", [
  "queued",
  "processing",
  "completed",
  "anomaly",
]);

export const anomalyCodeEnum = pgEnum("anomaly_code", [
  "internal_error",
  "invalid_content",
  "evidence_anomaly",
  "unknown_currency",
]);

// ==========================================
// Auth.js Tables (必须先定义，因为其他表依赖它们)
// ==========================================

// Users - 用户表
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified"),
  image: text("image"),
  // Default ledger will be set after ledger is created (no FK to avoid circular type dependency)
  defaultLedgerId: uuid("default_ledger_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Accounts - OAuth 账户关联（为未来 OAuth 扩展预留）
export const accounts = pgTable("accounts", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (table) => [
  primaryKey({ columns: [table.provider, table.providerAccountId] }),
]);

// Sessions - 数据库 Session（含设备信息）
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires").notNull(),
  // Extended fields for device management
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  deviceName: text("device_name"),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_sessions_user_id").on(table.userId),
]);

// Verification Tokens - Magic Link 验证令牌
export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  expires: timestamp("expires").notNull(),
}, (table) => [
  primaryKey({ columns: [table.identifier, table.token] }),
]);

// OTP Tokens - 验证码登录令牌
export const otpTokens = pgTable("otp_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),  // SHA-256 哈希
  expires: timestamp("expires").notNull(),            // 5 分钟 TTL

  // 安全控制
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),             // 锁定至某时刻

  // 审计字段
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastAttemptAt: timestamp("last_attempt_at"),
  verifiedAt: timestamp("verified_at"),
  ipAddress: text("ip_address"),
}, (table) => [
  index("idx_otp_tokens_email").on(table.email),
  index("idx_otp_tokens_expires").on(table.expires),
]);

// ==========================================
// Business Tables
// ==========================================

// Ledger（账本）- 依赖 users
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
  anomalyCodes: jsonb("anomaly_codes").$type<string[]>().default([]),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("idx_source_docs_ledger_status").on(table.ledgerId, table.status),
  index("idx_source_docs_ledger_created").on(table.ledgerId, table.createdAt),
]);

// Shares (分享链接)
export const shares = pgTable("shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceDocumentId: uuid("source_document_id")
    .notNull()
    .references(() => sourceDocuments.id, { onDelete: "cascade" }),
  ledgerId: uuid("ledger_id")
    .notNull()
    .references(() => ledgers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),  // null = never expires
  isActive: boolean("is_active").notNull().default(true),
  accessCount: integer("access_count").notNull().default(0),
}, (table) => [
  index("idx_shares_source_doc").on(table.sourceDocumentId),
  index("idx_shares_ledger").on(table.ledgerId),
]);

// Share Access Logs (分享访问审计日志)
export const shareAccessLogs = pgTable("share_access_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  shareId: uuid("share_id")
    .notNull()
    .references(() => shares.id, { onDelete: "cascade" }),
  accessedAt: timestamp("accessed_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  referer: text("referer"),
}, (table) => [
  index("idx_share_access_logs_share_id").on(table.shareId),
  index("idx_share_access_logs_accessed_at").on(table.accessedAt),
]);

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

// TaskRuns (任务运行记录 - 仅用于审计和前端展示)
export const taskRuns = pgTable("task_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ledgerId: uuid("ledger_id").references(() => ledgers.id, { onDelete: "cascade" }),

  // Task identification
  type: text("type").notNull(),               // System Name: 'parse_source_document'
  title: text("title").notNull(),             // Display Title: '解析：星巴克小票'
  bullFlowId: text("bull_flow_id"),           // BullMQ Flow ID (Root Job)

  // Result
  status: text("status").notNull().default("running"), // 'running' | 'completed' | 'failed'
  output: jsonb("output").$type<unknown>(),
  error: text("error"),

  // Statistics
  totalJobs: integer("total_jobs").default(1),        // Total task count (including children)
  completedJobs: integer("completed_jobs").default(0),
  failedJobs: integer("failed_jobs").default(0),

  // Token usage (aggregated)
  usage: jsonb("usage").$type<{ inputTokens: number; outputTokens: number; totalTokens: number }>(),

  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_task_runs_ledger_status").on(table.ledgerId, table.status),
  index("idx_task_runs_created_at").on(table.createdAt),
]);

// CurrencyRates (汇率缓存 - Daily Snapshot)
export const currencyRates = pgTable("currency_rates", {
  date: date("date", { mode: "string" }).primaryKey(), // YYYY-MM-DD
  base: text("base").notNull().default("EUR"), // Always EUR from Frankfurter
  rates: jsonb("rates").$type<Record<string, number>>().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ==========================================
// Relations (定义在所有表之后)
// ==========================================

// Auth relations
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  ledgers: many(ledgers),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// Business relations
export const ledgersRelations = relations(ledgers, ({ one, many }) => ({
  user: one(users, {
    fields: [ledgers.userId],
    references: [users.id],
  }),
  ledgerEntries: many(ledgerEntries),
  sourceDocuments: many(sourceDocuments),
}));

export const entryCategoriesRelations = relations(entryCategories, ({ one, many }) => ({
  ledger: one(ledgers, {
    fields: [entryCategories.ledgerId],
    references: [ledgers.id],
  }),
  ledgerEntries: many(ledgerEntries),
}));

export const sourceDocumentsRelations = relations(
  sourceDocuments,
  ({ one, many }) => ({
    ledger: one(ledgers, {
      fields: [sourceDocuments.ledgerId],
      references: [ledgers.id],
    }),
    ledgerEntries: many(ledgerEntries),
    shares: many(shares),
  })
);

export const sharesRelations = relations(shares, ({ one, many }) => ({
  sourceDocument: one(sourceDocuments, {
    fields: [shares.sourceDocumentId],
    references: [sourceDocuments.id],
  }),
  ledger: one(ledgers, {
    fields: [shares.ledgerId],
    references: [ledgers.id],
  }),
  accessLogs: many(shareAccessLogs),
}));

export const shareAccessLogsRelations = relations(shareAccessLogs, ({ one }) => ({
  share: one(shares, {
    fields: [shareAccessLogs.shareId],
    references: [shares.id],
  }),
}));

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

export const serviceCredentialsRelations = relations(serviceCredentials, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [serviceCredentials.ledgerId],
    references: [ledgers.id],
  }),
}));

export const taskRunsRelations = relations(taskRuns, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [taskRuns.ledgerId],
    references: [ledgers.id],
  }),
}));
