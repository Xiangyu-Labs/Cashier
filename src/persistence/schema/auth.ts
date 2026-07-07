import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";

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
