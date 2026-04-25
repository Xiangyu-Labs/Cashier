import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { UserRole, type UserRoleValue } from "@/modules/admin/types";

export const users = sqliteTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "timestamp_ms" }),
    image: text("image"),
    passwordHash: text("password_hash"),
    role: text("role")
      .notNull()
      .default(UserRole.User)
      .$type<UserRoleValue>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("idx_users_email").on(table.email)]
);

export type User = InferSelectModel<typeof users>;

export const accounts = sqliteTable(
  "accounts",
  {
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
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    index("idx_accounts_user_id").on(table.userId),
  ]
);

export type Account = InferSelectModel<typeof accounts>;

export const otpTokens = sqliteTable(
  "otp_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    ipAddress: text("ip_address"),
  },
  (table) => [
    index("idx_otp_tokens_email").on(table.email),
    index("idx_otp_tokens_expires").on(table.expires),
    index("idx_otp_tokens_verified").on(table.email, table.verifiedAt),
  ]
);

export type OTPToken = InferSelectModel<typeof otpTokens>;
