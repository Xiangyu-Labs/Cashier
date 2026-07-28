import { pgTable, text, integer, index, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { type InferSelectModel } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    passwordHash: text("password_hash"),
    passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("idx_users_email").on(table.email)]
);

export type User = InferSelectModel<typeof users>;

export const otpTokens = pgTable(
  "otp_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
  },
  (table) => [
    index("idx_otp_tokens_email").on(table.email),
    index("idx_otp_tokens_expires").on(table.expires),
    index("idx_otp_tokens_verified").on(table.email, table.verifiedAt),
  ]
);

export type OTPToken = InferSelectModel<typeof otpTokens>;

export const emailChangeChallenges = pgTable(
  "email_change_challenges",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    newEmail: text("new_email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uniq_email_change_challenge_user").on(table.userId),
    index("idx_email_change_challenge_expires").on(table.expiresAt),
  ]
);
