// Setup for Vitest integration tests with per-file database isolation

import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/persistence";
import { cleanup } from "@testing-library/react";
import type { Mock } from "vitest";
import { createTestSchema } from "./helpers/schema-setup";
import { memoryStore } from "@/lib/memory-store";

// Set required AI model environment variables for tests
process.env.AI_MODEL_TEXT = process.env.AI_MODEL_TEXT ?? "test-text-model";
process.env.AI_MODEL_VISION = process.env.AI_MODEL_VISION ?? "test-vision-model";

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
  await createTestSchema(db, client);
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
    "accounts",
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
    if (args.length === 1 && typeof args[0] === "function") {
      const handler = args[0] as (req: unknown, ctx: unknown) => unknown;
      return async (req: { auth?: unknown }, ctx: unknown) => {
        req.auth = req.auth ?? {
          user: {
            id: "00000000-0000-0000-0000-000000000000",
            email: "test@example.com",
          },
        };
        return handler(req, ctx);
      };
    }
    return Promise.resolve({
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        email: "test@example.com",
      },
    });
  },
}));

import type * as ReactModule from "react";

// Mock i18n globally
vi.mock("next-intl", async () => {
  const actual = await vi.importActual("react");
  const React = actual as typeof ReactModule;
  const messages = await import("../messages/zh.json").then((m) => m.default ?? m);

  const messagesRecord = messages as Record<string, unknown>;

  return {
    useTranslations: (namespace?: string) => {
      const nsMessages =
        namespace != null ? (messagesRecord[namespace] as Record<string, unknown>) : messagesRecord;
      return (key: string, values?: Record<string, unknown>) => {
        let msg = nsMessages?.[key];
        if (msg == null) {
          for (const ns in messagesRecord) {
            const nsMsg = messagesRecord[ns] as Record<string, unknown>;
            if (nsMsg != null && typeof nsMsg === "object" && nsMsg[key] != null) {
              msg = nsMsg[key];
              break;
            }
          }
        }
        if (msg == null) return key;
        let translated = msg as string;
        if (values != null && typeof translated === "string") {
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
  default: (props: { src: string; alt: string; [key: string]: unknown }) => {
    return React.createElement("img", { ...props, src: props.src });
  },
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));
