import crypto from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, expect, vi } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "@/persistence";
import { memoryStore } from "@/lib/memory-store";
import "./setup.common";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://cashier:cashier@127.0.0.1:55432/cashier_test";
process.env.DATABASE_URL = TEST_DATABASE_URL;

interface TestDatabase {
  pool: Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
  schemaName: string;
}

const dbInstances = new Map<string, TestDatabase>();

function getCurrentTestFile(): string {
  return expect.getState().testPath ?? "unknown";
}

function schemaNameFor(testPath: string): string {
  return `test_${crypto.createHash("sha256").update(testPath).digest("hex").slice(0, 16)}`;
}

export function getTestDb() {
  const instance = dbInstances.get(getCurrentTestFile());
  if (instance == null) throw new Error("Test PostgreSQL database is not initialized");
  return instance.db;
}

beforeAll(async () => {
  if (process.env.NO_DB != null) return;
  const testPath = getCurrentTestFile();
  const schemaName = schemaNameFor(testPath);
  const admin = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin.query(`CREATE SCHEMA "${schemaName}"`);
  await admin.end();

  const pool = new Pool({
    connectionString: TEST_DATABASE_URL,
    options: `-c search_path=${schemaName}`,
    max: 2,
  });
  const db = drizzle(pool, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve("src/persistence/postgres-migrations"),
    migrationsSchema: `${schemaName}_migrations`,
  });
  dbInstances.set(testPath, { pool, db, schemaName });
});

afterAll(async () => {
  for (const { pool, schemaName } of dbInstances.values()) {
    await pool.end();
    const admin = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}_migrations" CASCADE`);
    await admin.end();
  }
  dbInstances.clear();
});

beforeEach(async () => {
  await memoryStore.flushall();
  const db = getTestDb();
  await db.execute(sql.raw(`TRUNCATE TABLE
    processing_outbox, processing_attempts, revision_entries, revision_files,
    upload_session_files, upload_sessions, stored_files, source_document_revisions,
    idempotency_records, ledger_entries, source_documents, entry_categories,
    service_credentials, currency_rates, otp_tokens, ledgers, users
    RESTART IDENTITY CASCADE`));
  await db.insert(schema.users).values({
    id: "00000000-0000-0000-0000-000000000000",
    email: "test@example.com",
    name: "Test User",
    emailVerified: new Date(),
  });
});

vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));
