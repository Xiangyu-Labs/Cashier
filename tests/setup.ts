import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { cleanup } from "@testing-library/react";

// Test database connection
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://test:test@localhost:5433/cashier_test";

let testClient: ReturnType<typeof postgres>;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

export function getTestDb() {
  return testDb;
}

beforeAll(async () => {
  testClient = postgres(TEST_DATABASE_URL);
  testDb = drizzle(testClient, { schema });

  // Run migrations
  await runMigrations();
});

afterAll(async () => {
  await testClient.end();
});

beforeEach(async () => {
  // Clean all tables before each test
  if (getTestDb()) {
    await testDb.execute(
      sql`TRUNCATE transactions, input_messages, categories, ledgers CASCADE`
    );

  }
});

afterEach(() => {
  cleanup();
});

async function runMigrations() {
  // Drop tables to ensure clean state with new schema
  await testDb.execute(sql`DROP TABLE IF EXISTS settings CASCADE`);
  await testDb.execute(sql`DROP TABLE IF EXISTS transactions CASCADE`);
  await testDb.execute(sql`DROP TABLE IF EXISTS input_messages CASCADE`);
  await testDb.execute(sql`DROP TABLE IF EXISTS categories CASCADE`);
  await testDb.execute(sql`DROP TABLE IF EXISTS ledgers CASCADE`);

  // Create enums
  await testDb.execute(sql`
    DO $$ BEGIN
      CREATE TYPE transaction_status AS ENUM ('pending', 'confirmed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await testDb.execute(sql`
    DO $$ BEGIN
      CREATE TYPE source_type AS ENUM ('text', 'image', 'audio', 'mixed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await testDb.execute(sql`
    DO $$ BEGIN
      CREATE TYPE content_type AS ENUM ('text', 'image', 'audio');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await testDb.execute(sql`
    DO $$ BEGIN
      CREATE TYPE message_status AS ENUM ('queued', 'processing', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create tables
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      language TEXT NOT NULL DEFAULT 'zh-CN',
      currencies JSONB DEFAULT '["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"]',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS ledgers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS input_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      content_type content_type NOT NULL,
      content TEXT NOT NULL,
      status message_status NOT NULL DEFAULT 'queued',
      error TEXT,
      ai_response TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      input_message_id UUID REFERENCES input_messages(id) ON DELETE SET NULL,
      amount DECIMAL(12, 2) NOT NULL,
      currency TEXT,
      item_name TEXT NOT NULL,
      description TEXT,
      status transaction_status NOT NULL DEFAULT 'pending',
      source_type source_type NOT NULL,
      transaction_date DATE,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

// Mock the db module globally
vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));
