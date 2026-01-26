import { sql } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

export async function createTestSchema(db: PostgresJsDatabase<typeof schema>) {
  // Drop tables to ensure clean state with new schema
  await db.execute(sql`DROP TABLE IF EXISTS settings CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS transactions CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS input_messages CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS categories CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS ledgers CASCADE`);

  // Create enums
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE transaction_status AS ENUM ('pending', 'confirmed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE source_type AS ENUM ('text', 'image', 'audio', 'mixed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE content_type AS ENUM ('text', 'image', 'audio');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE message_status AS ENUM ('queued', 'processing', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      language TEXT NOT NULL DEFAULT 'zh-CN',
      currencies JSONB DEFAULT '["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"]',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      auto_confirm BOOLEAN DEFAULT FALSE
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ledgers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'zh-CN',
      currencies JSONB DEFAULT '["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"]',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      auto_confirm BOOLEAN DEFAULT FALSE
    );
  `);

  await db.execute(sql`
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

  await db.execute(sql`
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

  await db.execute(sql`
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

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE,
      ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMP
    );
  `);
}
