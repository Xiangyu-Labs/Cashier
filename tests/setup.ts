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

import { createTestSchema } from "./helpers/schema-setup";

beforeAll(async () => {
  if (process.env.NO_DB) return;

  testClient = postgres(TEST_DATABASE_URL);
  testDb = drizzle(testClient, { schema });

  // Run migrations
  await createTestSchema(testDb);
});

afterAll(async () => {
  if (testClient) {
    await testClient.end();
  }
});

beforeEach(async () => {
  // Clean all tables before each test
  if (getTestDb()) {
    await testDb.execute(
      sql`TRUNCATE transactions, receipts, categories, ledgers, api_keys CASCADE`
    );
  }
});


afterEach(() => {
  cleanup();
});

// Mock the db module globally
vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

// Mock i18n globally
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "zh",
  useMessages: () => ({}),
  useTimeZone: () => "UTC",
  useNow: () => new Date(),
}));
