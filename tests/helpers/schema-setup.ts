import { sql } from "drizzle-orm";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

export const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function createTestSchema(db: PostgresJsDatabase<typeof schema>) {
  // Use a different lock ID for "is creation done" check

  // Try to acquire a session-level advisory lock. 
  // If we can't get it immediately, it means someone else is creating or already created it.
  // Wait, session locks stay until connection ends. In tests, connections stay.

  // Better: Use a simple table or a specific lock pattern.
  // Let's use a transaction lock but check for existence.

  await db.transaction(async (tx) => {
    // Advisory lock for the duration of the transaction
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1234567)`);

    // Check if a known table exists to skip creation
    const tableCheck = await tx.execute(sql`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
      LIMIT 1
    `);

    if ((tableCheck as unknown as unknown[]).length > 0) {
      // Schema already exists, skip creation
      return;
    }

    // Drop tables if they exist to start fresh (in case of partial state)
    await tx.execute(sql`
      DROP TABLE IF EXISTS ledger_entries CASCADE;
      DROP TABLE IF EXISTS source_documents CASCADE;
      DROP TABLE IF EXISTS entry_categories CASCADE;
      DROP TABLE IF EXISTS service_credentials CASCADE;
      DROP TABLE IF EXISTS otp_tokens CASCADE;
      DROP TABLE IF EXISTS task_runs CASCADE;
      DROP TABLE IF EXISTS ledgers CASCADE;
      DROP TABLE IF EXISTS currency_rates CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS accounts CASCADE;
      DROP TABLE IF EXISTS verification_tokens CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      
      DROP TABLE IF EXISTS settings CASCADE;
      DROP TABLE IF EXISTS transactions CASCADE;
      DROP TABLE IF EXISTS receipts CASCADE;
      DROP TABLE IF EXISTS categories CASCADE;
      DROP TABLE IF EXISTS api_keys CASCADE;
      DROP TABLE IF EXISTS gpt_tasks CASCADE;
      DROP TABLE IF EXISTS push_subscriptions CASCADE;

      DROP TYPE IF EXISTS source_document_status CASCADE;
      DROP TYPE IF EXISTS error_code CASCADE;
    `);

    // Create enums
    await tx.execute(sql`
      CREATE TYPE source_document_status AS ENUM ('queued', 'processing', 'completed', 'anomaly');
    `);

    // Create auth tables first (users is referenced by ledgers)
    await tx.execute(sql`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT,
        email TEXT NOT NULL UNIQUE,
        email_verified TIMESTAMP,
        image TEXT,
        default_ledger_id UUID,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP
      );

      CREATE TABLE accounts (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at TIMESTAMP,
        token_type TEXT,
        scope TEXT,
        id_token TEXT,
        session_state TEXT,
        PRIMARY KEY (provider, provider_account_id)
      );

      CREATE TABLE sessions (
        session_token TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires TIMESTAMP NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        device_name TEXT,
        last_active_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE verification_tokens (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires TIMESTAMP NOT NULL,
        PRIMARY KEY (identifier, token)
      );

      CREATE TABLE otp_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires TIMESTAMP NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_attempt_at TIMESTAMP,
        verified_at TIMESTAMP,
        ip_address TEXT
      );

      CREATE INDEX idx_otp_tokens_email ON otp_tokens(email);
      CREATE INDEX idx_otp_tokens_expires ON otp_tokens(expires);

      CREATE INDEX idx_sessions_user_id ON sessions(user_id);

      CREATE TABLE push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, endpoint)
      );

      CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
    `);

    // Create business tables
    await tx.execute(sql`
      CREATE TABLE ledgers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP
      );

      CREATE INDEX idx_ledgers_user_id ON ledgers(user_id);

      CREATE TABLE entry_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_editable BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP
      );

      CREATE TABLE source_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
        title TEXT,
        text TEXT,
        image_urls JSONB DEFAULT '[]'::jsonb,
        status source_document_status NOT NULL DEFAULT 'queued',
        anomaly_codes JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP
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
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMP
      );

      CREATE TABLE service_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL UNIQUE,
        ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP,
        deleted_at TIMESTAMP
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
        completed_at TIMESTAMP,
        deleted_at TIMESTAMP
      );

      -- Shares removed
    `);

  });

  // This query might be acting as a synchronization point for tests
  await db.execute(sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);

}

// Helper to create a test user and return the user ID
export async function createTestUser(
  db: PostgresJsDatabase<typeof schema>,
  email = "test@example.com",
  id = TEST_USER_ID
): Promise<string> {
  const result = await db.execute(sql`
    INSERT INTO users (id, email, name, email_verified) 
    VALUES (${id}, ${email}, 'Test User', NOW())
    ON CONFLICT (id) DO UPDATE SET email = ${email}
    RETURNING id
  `);
  return (result as unknown as { id: string }[])[0].id;
}

// Helper to create a test user and ledger together
export async function createTestUserWithLedger(
  db: PostgresJsDatabase<typeof schema>,
  email = "test@example.com",
  ledgerName = "Test Ledger",
  userId = TEST_USER_ID
): Promise<{ userId: string; ledgerId: string }> {
  const finalUserId = await createTestUser(db, email, userId);

  const ledgerResult = await db.execute(sql`
    INSERT INTO ledgers (user_id, name) 
    VALUES (${finalUserId}, ${ledgerName})
    RETURNING id
  `);
  const ledgerId = (ledgerResult as unknown as { id: string }[])[0].id;

  return { userId: finalUserId, ledgerId };
}
