#!/usr/bin/env node

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
const BOOTSTRAP_LOCK_ID = 1_129_071_779;

function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (value == null || !/^postgres(?:ql)?:\/\//.test(value)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  }
  return value;
}

async function main() {
  const client = new pg.Client({ connectionString: requiredDatabaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [BOOTSTRAP_LOCK_ID]);
    const existing = await client.query('SELECT 1 FROM "users" LIMIT 1');
    if (existing.rowCount !== 0) {
      await client.query("COMMIT");
      console.log("[bootstrap] Existing user found; initial-user bootstrap skipped");
      return;
    }

    const email = process.env.INITIAL_USER_EMAIL?.trim().toLowerCase() ?? "";
    const password = process.env.INITIAL_USER_PASSWORD ?? "";
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error("INITIAL_USER_EMAIL must be a valid email address for an empty database");
    }
    if (!PASSWORD_PATTERN.test(password)) {
      throw new Error(
        "INITIAL_USER_PASSWORD must be 8-128 characters with at least one letter and one number"
      );
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO "users"
        ("id", "email", "email_verified", "password_hash", "password_updated_at", "registration_completed_at", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $3, $3, $3, $3)`,
      [crypto.randomUUID(), email, now, passwordHash]
    );
    await client.query("COMMIT");
    console.log(`[bootstrap] Initial user created: ${email}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[bootstrap] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
