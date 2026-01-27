import { sql } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

export async function createTestSchema(db: PostgresJsDatabase<typeof schema>) {
  console.log("Starting createTestSchema...");
  // Drop tables to ensure clean state with new schema
  await db.execute(sql`DROP TABLE IF EXISTS settings CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS transactions CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS input_messages CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS categories CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS api_keys CASCADE`);

  await db.execute(sql`DROP TABLE IF EXISTS ledgers CASCADE`);

  await db.execute(sql`DROP TYPE IF EXISTS transaction_status CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS message_status CASCADE`);
  // Drop unused enum if exists
  await db.execute(sql`DROP TYPE IF EXISTS source_type CASCADE`);

  // Create enums
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE transaction_status AS ENUM ('pending', 'confirmed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  // sourceType is removed effectively from usage but enum might linger in DB if not dropped. 
  // For test setup we can just skip creating it or keep it if existing code still references type only.
  // But we should update message_status
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE message_status AS ENUM ('queued', 'processing', 'to_confirm', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  // Settings table removed

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
      text TEXT,
      image_urls JSONB DEFAULT '[]'::jsonb,
      status message_status NOT NULL DEFAULT 'queued',
      error TEXT,
      ai_response TEXT,
      proposed_transactions JSONB,
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
      transaction_date DATE,
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
  console.log("Finished createTestSchema.");

  const tables = await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log("Tables in DB:", tables.map(t => t.table_name));
}
