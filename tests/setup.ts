import { beforeAll, afterAll, beforeEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

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
  await testDb.execute(
    sql`TRUNCATE transactions, input_messages, categories, ledgers CASCADE`
  );
});

async function runMigrations() {
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

  // Create tables
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS ledgers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'zh-CN',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
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
