import { sql } from "drizzle-orm";
import { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/lib/db/schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function createTestSchema(db: BetterSQLite3Database<typeof schema>, client: Database.Database) {
  // Drop all tables to start fresh
  const tables = client.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  for (const { name } of tables) {
    if (name === "sqlite_sequence") continue; // Don't drop sequence table
    client.prepare(`DROP TABLE IF EXISTS "${name}"`).run();
  }

  // Run migrations
  // Adjust path if needed. Tests run from project root?
  await migrate(db, { migrationsFolder: "src/lib/db/migrations" });
}

// Helper to create a test user and return the user ID
export async function createTestUser(
  db: BetterSQLite3Database<typeof schema>,
  email = "test@example.com",
  id = TEST_USER_ID
): Promise<string> {
  const existing = await db.select().from(schema.users).where(sql`${schema.users.id} = ${id}`).limit(1);
  if (existing.length > 0) {
    // SQLite doesn't support ON CONFLICT DO UPDATE nicely with returning in all cases for simple execute
    // Just update if exists
    await db.update(schema.users).set({ email }).where(sql`${schema.users.id} = ${id}`);
    return id;
  }

  await db.insert(schema.users).values({
    id,
    email,
    name: "Test User",
    emailVerified: new Date(),
    metadata: {}, // SQLite JSON
  });
  return id;
}

// Helper to create a test user and ledger together
export async function createTestUserWithLedger(
  db: BetterSQLite3Database<typeof schema>,
  email = "test@example.com",
  ledgerName = "Test Ledger",
  userId = TEST_USER_ID
): Promise<{ userId: string; ledgerId: string }> {
  const finalUserId = await createTestUser(db, email, userId);

  const ledgerId = crypto.randomUUID();
  await db.insert(schema.ledgers).values({
    id: ledgerId,
    userId: finalUserId,
    name: ledgerName,
    metadata: {},
  });

  return { userId: finalUserId, ledgerId };
}
