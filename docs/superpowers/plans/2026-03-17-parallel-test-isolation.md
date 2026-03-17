# 并行测试隔离实现计划

> **For agentic workers:** REQUIRED: Use @superpowers-extended-cc:subagent-driven-development (if subagents available) or @superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个测试文件使用独立的内存 SQLite 数据库实例，重新启用并行测试执行，将测试时间从 ~70s 减少到 ~20-30s。

**Architecture:** 使用测试文件路径作为 key，在 `beforeAll` 时创建独立数据库实例，存储在 Map 中。`getTestDb()` 根据当前测试上下文返回对应的数据库实例。所有测试完成后统一清理资源。

**Tech Stack:** Vitest, SQLite (:memory:), Drizzle ORM, better-sqlite3

---

## Chunk 1: Core Test Infrastructure Refactoring

### Task 1: Create Per-File Database Isolation in setup.ts

**Files:**
- Modify: `tests/setup.ts:1-130`
- Test: Run all tests to verify no regressions

**Context:** 当前 `tests/setup.ts` 使用全局共享的 `testClient` 和 `testDb` 变量。当 `fileParallelism: true` 时，多个测试文件同时运行会共享同一个内存数据库，导致数据污染。

**Changes Required:**
1. 移除全局 `testClient` 和 `testDb` 变量
2. 创建 `dbInstances` Map 存储每个测试文件的数据库实例
3. 修改 `getTestDb()` 根据测试文件路径返回对应实例
4. 修改 `beforeAll` 为每个文件创建独立数据库
5. 修改 `beforeEach` 清理当前文件的表数据
6. 修改 `afterAll` 关闭所有数据库连接

- [ ] **Step 1: Create backup of original setup.ts**

```bash
cp tests/setup.ts tests/setup.ts.backup
```

- [ ] **Step 2: Refactor setup.ts for per-file database isolation**

```typescript
// Setup for Vitest integration tests with per-file database isolation

import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@/lib/db/schema";
import { cleanup } from "@testing-library/react";
import type { Mock } from "vitest";
import { createTestSchema } from "./helpers/schema-setup";
import { memoryStore } from "@/lib/memory-store";

// Set required AI model environment variables for tests
process.env.AI_MODEL_TEXT = process.env.AI_MODEL_TEXT || "test-text-model";
process.env.AI_MODEL_VISION = process.env.AI_MODEL_VISION || "test-vision-model";

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
  // @ts-expect-error - Vitest internal API
  return expect.getState().testPath || "unknown";
}

// Get database instance for current test file
export function getTestDb() {
  const testPath = getCurrentTestFile();
  const instance = dbInstances.get(testPath);
  if (!instance) {
    throw new Error(`No database instance found for test file: ${testPath}. Make sure beforeAll ran.`);
  }
  return instance.db;
}

// Get database client for current test file (for raw SQL operations)
function getTestClient(): Database.Database {
  const testPath = getCurrentTestFile();
  const instance = dbInstances.get(testPath);
  if (!instance) {
    throw new Error(`No database instance found for test file: ${testPath}`);
  }
  return instance.client;
}

beforeAll(async () => {
  if (process.env.NO_DB) return;

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
    "verification_tokens",
    "otp_tokens",
  ];

  for (const table of tables) {
    client.prepare(`DELETE FROM "${table}"`).run();
  }

  // Ensure default test user exists
  try {
    await db.insert(schema.users).values({
      id: '00000000-0000-0000-0000-000000000000',
      email: 'test@example.com',
      name: 'Test User',
      emailVerified: new Date(),
    });
  } catch (_e) {
    // User already exists, which is the expected case
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
  updateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));
```

- [ ] **Step 3: Run tests to verify setup.ts changes work**

Run: `npm run test:run`
Expected: All tests pass (899 tests)

- [ ] **Step 4: Commit setup.ts changes**

```bash
git add tests/setup.ts
git commit -m "feat(tests): implement per-file database isolation for parallel execution

- Replace global testDb with Map-based per-file instances
- Each test file now gets its own :memory: SQLite database
- Enables safe parallel test execution without data pollution"
```

### Task 2: Re-enable Parallel Test Execution in vitest.config.ts

**Files:**
- Modify: `vitest.config.ts:20-26`

**Context:** 当前配置设置了 `fileParallelism: false` 来避免数据库冲突。在实现了 per-file 数据库隔离后，可以安全地重新启用并行执行。

- [ ] **Step 1: Update vitest.config.ts to enable parallel execution**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./tests/setup.ts"],
    env: {
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules", ".next", "tests"],
    },
    // Enable parallel test execution with per-file database isolation
    pool: "threads",
    fileParallelism: true,
    maxWorkers: "50%",
    isolate: true,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "messages": path.resolve(__dirname, "messages"),
      "tests": path.resolve(__dirname, "tests"),
    },
  },
});
```

- [ ] **Step 2: Run full test suite to verify parallel execution**

Run: `npm run test:run`
Expected:
- All 899 tests pass
- Test duration should be ~20-30s (down from ~70s)
- No database lock or data pollution errors

- [ ] **Step 3: Commit vitest config changes**

```bash
git add vitest.config.ts
git commit -m "feat(tests): re-enable parallel test execution

- Set fileParallelism: true with per-file database isolation
- Test execution time reduced from ~70s to ~20-30s"
```

---

## Chunk 2: Verification and Cleanup

### Task 3: Verify No Regressions

**Files:**
- All test files in `tests/`

- [ ] **Step 1: Run full test suite multiple times**

Run: `npm run test:run`
Run 3 times to ensure consistency
Expected: All 3 runs pass with 100% success rate

- [ ] **Step 2: Verify test execution time improvement**

Before: ~69s (sequential)
After: ~20-30s (parallel)

Measure: `time npm run test:run`

- [ ] **Step 3: Clean up backup file**

```bash
rm tests/setup.ts.backup
```

- [ ] **Step 4: Final commit**

```bash
git commit -m "chore(tests): clean up backup file after parallel test implementation"
```

---

## Summary

**Changes Made:**
1. `tests/setup.ts` - 从全局共享数据库改为每个测试文件独立的内存数据库实例
2. `vitest.config.ts` - 重新启用 `fileParallelism: true`

**Expected Results:**
- 测试执行时间: ~70s → ~20-30s
- 保持 100% 测试通过率
- 无数据库竞争或数据污染问题

**Risks:**
- 内存占用增加（每个测试文件一个数据库实例）
- 某些依赖全局状态的测试可能需要调整（但当前隔离设计应已覆盖）

**Rollback Plan:**
如果出现问题，恢复备份文件 `tests/setup.ts.backup` 和 `vitest.config.ts` 中的 `fileParallelism: false`。
