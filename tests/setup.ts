// Set Redis URL for tests
process.env.REDIS_URL = "redis://127.0.0.1:6380";


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
  // Set Redis URL explicitly before anything else
  process.env.REDIS_URL = "redis://localhost:6380";

  if (process.env.NO_DB) return;

  // Enable background workers in tests with low concurrency
  process.env.FLOW_MAIN_QUEUE_CONCURRENCY = "1";
  process.env.FLOW_API_QUEUE_CONCURRENCY = "1";
  process.env.PROCESSING_WORKER_COUNT = "1";
  process.env.BULLMQ_LOCK_DURATION = "1000"; // Short for tests
  process.env.BULLMQ_STALLED_INTERVAL = "1000";

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
      sql`TRUNCATE ledger_entries, source_documents, entry_categories, ledgers, service_credentials, task_runs, currency_rates CASCADE`
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
vi.mock("next-intl", async () => {
  const actual = await vi.importActual("react");
  const React = actual as typeof import("react");
  return {
    useTranslations: () => (_key: string) => _key,
    useLocale: () => "zh",
    useMessages: () => ({}),
    useTimeZone: () => "UTC",
    useNow: () => new Date(),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});
