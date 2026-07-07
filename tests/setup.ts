// Setup for Vitest integration tests with per-file database isolation

import { beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/persistence";
import { createTestSchema } from "./helpers/schema-setup";
import { memoryStore } from "@/lib/memory-store";
import "./setup.common";

// Map to store database instances per test file
const dbInstances = new Map<
  string,
  {
    client: Database.Database;
    db: ReturnType<typeof drizzle<typeof schema>>;
  }
>();

// Get current test file path from Vitest state
function getCurrentTestFile(): string {
  return expect.getState().testPath ?? "unknown";
}

// Get database instance for current test file
export function getTestDb() {
  const testPath = getCurrentTestFile();
  const instance = dbInstances.get(testPath);
  if (instance == null) {
    throw new Error(
      `No database instance found for test file: ${testPath}. Make sure beforeAll ran.`
    );
  }
  return instance.db;
}

// Get database client for current test file (for raw SQL operations)
function getTestClient(): Database.Database {
  const testPath = getCurrentTestFile();
  const instance = dbInstances.get(testPath);
  if (instance == null) {
    throw new Error(`No database instance found for test file: ${testPath}`);
  }
  return instance.client;
}

beforeAll(async () => {
  if (process.env.NO_DB != null) return;

  const testPath = getCurrentTestFile();

  // Create independent in-memory SQLite database for this test file
  const client = new Database(":memory:");

  // Configure SQLite PRAGMA for consistency with production
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  client.pragma("synchronous = NORMAL");

  const db = drizzle(client, { schema });

  // Store instance
  dbInstances.set(testPath, { client, db });

  // Run migrations
  await createTestSchema(db);
  const { initializeDefaultFlowRuntime, resetFlowRuntime } = await import("@/lib/flow/runtime");
  resetFlowRuntime();
  await initializeDefaultFlowRuntime();
});

afterAll(async () => {
  // Close all database instances
  for (const [testPath, { client }] of dbInstances) {
    try {
      client.close();
    } catch (error) {
      console.warn(`Failed to close database for ${testPath}:`, error);
    }
  }
  dbInstances.clear();
});

beforeEach(async () => {
  // Clean memory store before each test
  await memoryStore.flushall();

  // Clean all tables before each test
  const client = getTestClient();
  const db = getTestDb();

  const tables = [
    "ledger_entries",
    "source_documents",
    "entry_categories",
    "ledgers",
    "service_credentials",
    "task_runs",
    "currency_rates",
    "otp_tokens",
    "users",
  ];

  for (const table of tables) {
    client.prepare(`DELETE FROM "${table}"`).run();
  }

  // Ensure default test user exists (ignore unique constraint errors)
  try {
    await db.insert(schema.users).values({
      id: "00000000-0000-0000-0000-000000000000",
      email: "test@example.com",
      name: "Test User",
      emailVerified: new Date(),
    });
  } catch (e) {
    // User already exists, which is the expected case
    console.log("[Test Setup] Test user already exists or other error:", e as Error);
  }
});

// Mock the db module globally
vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));
