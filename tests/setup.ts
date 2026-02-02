// Setup for Vitest integration tests


import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { cleanup } from "@testing-library/react";
import type { Mock } from "vitest";

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

import { memoryStore } from "@/lib/memory-store";

beforeAll(async () => {
  // 1. Safety Check: Never run tests against production ports
  const dbUrl = TEST_DATABASE_URL;

  if (dbUrl.includes(":5432")) {
    console.error("\x1b[31mCRITICAL ERROR: Tests attempted to connect to PRODUCTION DATABASE (5432)!\x1b[0m");
    process.exit(1);
  }

  if (process.env.NO_DB) return;

  // Dummy VAPID keys for testing to suppress warnings
  if (!process.env.VAPID_PRIVATE_KEY) process.env.VAPID_PRIVATE_KEY = "test_private_key";
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test_public_key";

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
  // Clean memory store before each test
  await memoryStore.flushall();

  // Clean all tables before each test
  if (getTestDb()) {
    await testDb.execute(
      sql`TRUNCATE ledger_entries, source_documents, entry_categories, ledgers, service_credentials, task_runs, currency_rates, sessions, accounts, verification_tokens, otp_tokens, users CASCADE`
    );

    // Insert default test user for Auth Mock (TEST_USER_ID)
    // Use ON CONFLICT to prevent race conditions during parallel test file execution
    await testDb.execute(sql`
        INSERT INTO users (id, email, name, email_verified) 
        VALUES ('00000000-0000-0000-0000-000000000000', 'test@example.com', 'Test User', NOW())
        ON CONFLICT (id) DO NOTHING
    `);
  }
});


afterEach(() => {
  cleanup();
});

// Mock window.confirm
if (typeof window !== "undefined") {
  (window as unknown as Window & { confirm: Mock }).confirm = vi.fn(() => true);
} else {
  (global as unknown as { confirm: Mock }).confirm = vi.fn(() => true);
}

// Mock the db module globally
vi.mock("@/lib/db", () => ({
  get db() {
    return getTestDb();
  },
}));

// Global Auth Mock
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => {
    // Case 1: Called as a wrapper function auth((req) => {...})
    if (args.length === 1 && typeof args[0] === "function") {
      const handler = args[0] as (req: unknown, ctx: unknown) => unknown;
      return async (req: { auth?: unknown }, ctx: unknown) => {
        req.auth = req.auth || {
          user: {
            id: "00000000-0000-0000-0000-000000000000",
            email: "test@example.com",
          },
        };
        return handler(req, ctx);
      };
    }
    // Case 2: Called to get session const session = await auth()
    return Promise.resolve({
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        email: "test@example.com",
      },
    });
  },
}));

// Mock i18n globally
vi.mock("next-intl", async () => {
  const actual = await vi.importActual("react");
  const React = actual as typeof import("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const messages = require("../messages/zh.json");

  return {
    useTranslations: (namespace?: string) => {
      const nsMessages = namespace ? messages[namespace] : messages;
      return (key: string, values?: Record<string, unknown>) => {
        let msg = nsMessages?.[key];

        // Absolute fallback: search all namespaces
        if (!msg) {
          for (const ns in messages) {
            if (messages[ns] && typeof messages[ns] === 'object' && messages[ns][key]) {
              msg = messages[ns][key];
              break;
            }
          }
        }

        if (!msg) return key;

        let translated = msg;
        if (values && typeof translated === "string") {
          Object.keys(values).forEach((k) => {
            translated = translated.replace(`{${k}}`, String(values[k]));
          });
        }
        return translated;
      };
    },
    useLocale: () => "zh",
    useMessages: () => messages,
    useTimeZone: () => "UTC",
    useNow: () => new Date(),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// Mock next/image
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string;[key: string]: unknown }) => {

    return React.createElement("img", { ...props, src: props.src });
  },
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));
