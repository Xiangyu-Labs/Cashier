import {
    sqliteTable,
    text,
    integer,
    primaryKey,
    index,
} from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";

// ==========================================
// Auth.js Tables
// ==========================================

// Users - 用户表
export const users = sqliteTable("users", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
    image: text("image"),
    // Default ledger will be set after ledger is created (no FK to avoid circular type dependency)
    defaultLedgerId: text("default_ledger_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
}, (table) => [
    index("idx_users_email").on(table.email),
]);

export type User = InferSelectModel<typeof users>;

// Accounts - OAuth 账户关联
export const accounts = sqliteTable("accounts", {
    userId: text("user_id")
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
    index("idx_accounts_user_id").on(table.userId),
]);

export type Account = InferSelectModel<typeof accounts>;

// OTP Tokens - 验证码登录令牌
export const otpTokens = sqliteTable("otp_tokens", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),  // SHA-256 哈希
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),            // 5 分钟 TTL

    // 安全控制
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),             // 锁定至某时刻

    // 审计字段
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    ipAddress: text("ip_address"),
}, (table) => [
    index("idx_otp_tokens_email").on(table.email),
    index("idx_otp_tokens_expires").on(table.expires),
    // For cleaning up verified tokens efficiently
    index("idx_otp_tokens_verified").on(table.email, table.verifiedAt),
]);
