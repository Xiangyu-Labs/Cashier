import { sql } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

export async function createTestSchema(db: PostgresJsDatabase<typeof schema>) {
  console.log("Starting createTestSchema...");
  // Drop tables to ensure clean state with new schema
  await db.execute(sql`DROP TABLE IF EXISTS settings CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS ledger_entries CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS source_documents CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS entry_categories CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS service_credentials CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS processing_tasks CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS ledgers CASCADE`);

  // Drop old names if they exist
  await db.execute(sql`DROP TABLE IF EXISTS transactions CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS receipts CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS categories CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS api_keys CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS gpt_tasks CASCADE`);

  await db.execute(sql`DROP TYPE IF EXISTS source_document_status CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS ledger_entry_status CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS error_code CASCADE`);

  // Create enums
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE source_document_status AS ENUM ('queued', 'processing', 'to_confirm', 'completed', 'error');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE error_code AS ENUM ('internal_error', 'parse_failed', 'invalid_content');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE ledger_entry_status AS ENUM ('pending', 'confirmed');
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
      auto_confirm BOOLEAN DEFAULT FALSE,
      auto_recognize_date BOOLEAN DEFAULT FALSE,
      collapse_pending_default BOOLEAN DEFAULT FALSE,
      merge_similar_items BOOLEAN DEFAULT FALSE
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS entry_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_editable BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS source_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      title TEXT,
      text TEXT,
      image_urls JSONB DEFAULT '[]'::jsonb,
      status source_document_status NOT NULL DEFAULT 'queued',
      error_code error_code,
      ai_response TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      category_id UUID REFERENCES entry_categories(id) ON DELETE SET NULL,
      source_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
      amount DECIMAL(12, 2) NOT NULL,
      currency TEXT,
      item_name TEXT NOT NULL,
      description TEXT,
      entry_date DATE,
      status ledger_entry_status NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS service_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL UNIQUE,
      ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMP
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS processing_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
      entity_id UUID,
      entity_type TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      input JSONB,
      output JSONB,
      progress JSONB,
      metadata JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      started_at TIMESTAMP,
      completed_at TIMESTAMP
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
