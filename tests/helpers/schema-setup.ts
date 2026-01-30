import { sql } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

export async function createTestSchema(db: PostgresJsDatabase<typeof schema>) {
  await db.transaction(async (tx) => {
    // Advisory lock for the duration of the transaction
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1234567)`);

    console.log("Starting createTestSchema in transaction...");

    // Drop tables if they exist to start fresh
    await tx.execute(sql`
      DROP TABLE IF EXISTS ledger_entries CASCADE;
      DROP TABLE IF EXISTS source_documents CASCADE;
      DROP TABLE IF EXISTS entry_categories CASCADE;
      DROP TABLE IF EXISTS service_credentials CASCADE;
      DROP TABLE IF EXISTS processing_tasks CASCADE;
      DROP TABLE IF EXISTS task_runs CASCADE;
      DROP TABLE IF EXISTS ledgers CASCADE;
      DROP TABLE IF EXISTS currency_rates CASCADE;
      
      DROP TABLE IF EXISTS settings CASCADE;
      DROP TABLE IF EXISTS transactions CASCADE;
      DROP TABLE IF EXISTS receipts CASCADE;
      DROP TABLE IF EXISTS categories CASCADE;
      DROP TABLE IF EXISTS api_keys CASCADE;
      DROP TABLE IF EXISTS gpt_tasks CASCADE;

      DROP TYPE IF EXISTS source_document_status CASCADE;
      DROP TYPE IF EXISTS error_code CASCADE;
      DROP TYPE IF EXISTS ledger_entry_status CASCADE;
    `);

    // Create enums
    await tx.execute(sql`
      CREATE TYPE source_document_status AS ENUM ('queued', 'processing', 'to_confirm', 'completed', 'error');
      CREATE TYPE error_code AS ENUM ('internal_error', 'parse_failed', 'invalid_content');
      CREATE TYPE ledger_entry_status AS ENUM ('pending', 'confirmed');
    `);

    // Create tables
    await tx.execute(sql`
      CREATE TABLE ledgers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'zh-CN',
        currencies JSONB DEFAULT '["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"]',
        main_currency TEXT DEFAULT 'CNY',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        auto_confirm BOOLEAN DEFAULT FALSE,
        auto_recognize_date BOOLEAN DEFAULT FALSE,
        collapse_pending_default BOOLEAN DEFAULT FALSE,
        merge_similar_items BOOLEAN DEFAULT FALSE,
        ai_custom_prompt TEXT
      );

      CREATE TABLE entry_categories (
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

      CREATE TABLE source_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
        title TEXT,
        text TEXT,
        image_urls JSONB DEFAULT '[]'::jsonb,
        status source_document_status NOT NULL DEFAULT 'queued',
        error_code error_code,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE ledger_entries (
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

      CREATE TABLE service_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL UNIQUE,
        ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP
      );

      CREATE TABLE processing_tasks (
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

      CREATE TABLE currency_rates (
        date DATE PRIMARY KEY,
        base TEXT NOT NULL DEFAULT 'EUR',
        rates JSONB NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE task_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        bull_flow_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        output JSONB,
        error TEXT,
        total_jobs INTEGER DEFAULT 1,
        completed_jobs INTEGER DEFAULT 0,
        failed_jobs INTEGER DEFAULT 0,
        usage JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);
    console.log("Finished createTestSchema.");
  });

  // Settings table removed

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ledgers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'zh-CN',
      currencies JSONB DEFAULT '["CNY", "USD", "EUR", "JPY", "GBP", "HKD", "TWD"]',
      main_currency TEXT DEFAULT 'CNY',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      auto_confirm BOOLEAN DEFAULT FALSE,
      auto_recognize_date BOOLEAN DEFAULT FALSE,
      collapse_pending_default BOOLEAN DEFAULT FALSE,
      merge_similar_items BOOLEAN DEFAULT FALSE,
      ai_custom_prompt TEXT
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
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS currency_rates (
      date DATE PRIMARY KEY,
      base TEXT NOT NULL DEFAULT 'EUR',
      rates JSONB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS task_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      bull_flow_id TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      output JSONB,
      error TEXT,
      total_jobs INTEGER DEFAULT 1,
      completed_jobs INTEGER DEFAULT 0,
      failed_jobs INTEGER DEFAULT 0,
      usage JSONB,
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
