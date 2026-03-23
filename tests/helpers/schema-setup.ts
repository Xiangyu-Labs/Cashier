import { sql } from "drizzle-orm";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/persistence";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export const TEST_USER_ID = "00000000-0000-0000-0000-000000000000";

function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

export async function createTestSchema(
  db: BetterSQLite3Database<typeof schema>
) {
  await migrate(db, { migrationsFolder: "src/persistence/migrations" });
}

// Helper to create a test user and return the user ID
export async function createTestUser(
  db: BetterSQLite3Database<typeof schema>,
  email?: string, // 改为可选，默认使用随机email避免冲突
  id = TEST_USER_ID
): Promise<string> {
  // 使用随机email避免唯一约束冲突
  const finalEmail = email ?? `test-${crypto.randomUUID()}@example.com`;

  const existing = await db
    .select()
    .from(schema.users)
    .where(sql`${schema.users.id} = ${id}`)
    .limit(1);
  if (existing.length !== 0) {
    // SQLite doesn't support ON CONFLICT DO UPDATE nicely with returning in all cases for simple execute
    // Just update if exists
    await db
      .update(schema.users)
      .set({ email: finalEmail })
      .where(sql`${schema.users.id} = ${id}`);
    return id;
  }

  await db.insert(schema.users).values({
    id,
    email: finalEmail,
    name: "Test User",
    emailVerified: new Date(),
  });
  return id;
}

// Helper to create a test user and ledger together
export async function createTestUserWithLedger(
  db: BetterSQLite3Database<typeof schema>,
  email?: string, // 改为可选，默认使用随机email
  _ledgerName?: string, // 已废弃，账本名称不再使用
  userId?: string
): Promise<{ userId: string; ledgerId: string }> {
  const finalUserId = await createTestUser(db, email, userId ?? TEST_USER_ID);

  const ledgerId = crypto.randomUUID();
  await db.insert(schema.ledgers).values({
    id: ledgerId,
    userId: finalUserId,
    metadata: {},
  });

  return { userId: finalUserId, ledgerId };
}

// Helper to create a test source document
export async function createTestSourceDocument(
  db: BetterSQLite3Database<typeof schema>,
  ledgerId: string,
  overrides: Partial<{
    text: string;
    status: "queued" | "processing" | "completed" | "anomaly" | "failed" | "deleted";
    imageUrls: string[];
  }> = {}
): Promise<string> {
  const insertedDocs = await db
    .insert(schema.sourceDocuments)
    .values({
      ledgerId,
      text: overrides.text ?? "Test document",
      status: overrides.status ?? "completed",
      imageUrls: overrides.imageUrls ?? [],
    })
    .returning();
  const doc = requireDefined(insertedDocs[0], "Expected inserted source document");

  return doc.id;
}
