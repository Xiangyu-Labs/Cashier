import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    primaryKey,
    index,
} from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";

// ==========================================
// Auth.js Tables
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

export type User = InferSelectModel<typeof users>;

// Accounts - OAuth 账户关联
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

export type Account = InferSelectModel<typeof accounts>; // Added this type export

// Sessions - 数据库 Session
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

export type Session = InferSelectModel<typeof sessions>;

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
