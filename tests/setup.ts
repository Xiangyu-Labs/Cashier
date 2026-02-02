// Setup for Vitest integration tests


import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { cleanup } from "@testing-library/react";
import type { Mock } from "vitest";

// Test database connection
let testClient: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

export function getTestDb() {
  return testDb;
}

import { createTestSchema } from "./helpers/schema-setup";

import { memoryStore } from "@/lib/memory-store";

beforeAll(async () => {
  if (process.env.NO_DB) return;

  // Use in-memory SQLite for tests
  testClient = new Database(":memory:");
  testDb = drizzle(testClient, { schema });

  // Run migrations
  await createTestSchema(testDb, testClient);
});

afterAll(async () => {
  if (testClient) {
    testClient.close();
  }
});

beforeEach(async () => {
  // Clean memory store before each test
  await memoryStore.flushall();

  // Clean all tables before each test
  // SQLite doesn't support TRUNCATE, use DELETE FROM
  if (getTestDb()) {
    const tables = [
      "ledger_entries",
      "source_documents",
      "entry_categories",
      "ledgers",
      "service_credentials",
      "task_runs",
      "currency_rates",
      "sessions",
      "accounts",
      "verification_tokens",
      "otp_tokens",
      "users"
    ];

    for (const table of tables) {
      testClient.prepare(`DELETE FROM "${table}"`).run();
    }

    // Insert default test user for Auth Mock (TEST_USER_ID)
    try {
      await testDb.insert(schema.users).values({
        id: '00000000-0000-0000-0000-000000000000',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: new Date(),
        metadata: {},
      });
    } catch (e) {
      // Ignore unique constraint violation if exists
    }
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
