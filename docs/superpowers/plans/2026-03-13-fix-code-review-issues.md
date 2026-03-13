# 修复代码审查高优先级问题实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复代码审查发现的高优先级问题（安全问题、竞态条件、数据库问题、性能问题），遵守约束：不改动 AI 流程，不添加 Service 层

**Architecture:** 保持现有 Server Actions 架构，通过精确的局部修复解决安全、并发和数据一致性问题。所有修改遵循现有代码模式，不引入新的抽象层。

**Tech Stack:** Next.js 16 + TypeScript + SQLite/Drizzle ORM + Vitest

---

## 文件结构映射

| 文件 | 责任 | 修改类型 |
|------|------|----------|
| `src/lib/ai/openai-client.ts` | OpenAI 客户端配置 | 修改 |
| `src/auth.ts` | NextAuth 配置 | 修改 |
| `src/features/currency/server/exchange-rate-service.ts` | 汇率服务 | 修改 |
| `src/features/stats/server/actions/index.ts` | 统计 actions | 修改 |
| `src/features/ledger/server/schema.ts` | Ledger 表定义 | 修改 |
| `src/features/ledger/server/actions/entries.ts` | 条目 actions | 修改 |
| `drizzle.config.ts` | Drizzle 配置 | 修改 |
| `tests/unit/lib/ai/openai-client.test.ts` | OpenAI 客户端测试 | 创建 |
| `tests/unit/features/currency/exchange-rate-service.test.ts` | 汇率服务测试 | 创建 |

---

## Chunk 1: 安全修复

### Task 1: 修复 dangerouslyAllowBrowser 安全问题

**Files:**
- Modify: `src/lib/ai/openai-client.ts:16-20`
- Test: `tests/unit/lib/ai/openai-client.test.ts` (创建)

**问题**: `dangerouslyAllowBrowser: true` 硬编码在生产代码中，无环境变量控制

- [ ] **Step 1: 阅读现有代码**

```bash
cat src/lib/ai/openai-client.ts
```

确认代码结构，找到第 16-20 行的 OpenAI 客户端初始化代码。

- [ ] **Step 2: 编写测试验证当前行为**

Create `tests/unit/lib/ai/openai-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("openai-client", () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
    });

    it("should set dangerouslyAllowBrowser to true in test environment", async () => {
        process.env.NODE_ENV = "test";
        const { getOpenAIClient } = await import("@/lib/ai/openai-client");
        const client = getOpenAIClient();
        // @ts-expect-error accessing private property for testing
        expect(client.client.dangerouslyAllowBrowser).toBe(true);
    });

    it("should set dangerouslyAllowBrowser to false in production environment", async () => {
        process.env.NODE_ENV = "production";
        const { getOpenAIClient } = await import("@/lib/ai/openai-client");
        const client = getOpenAIClient();
        // @ts-expect-error accessing private property for testing
        expect(client.client.dangerouslyAllowBrowser).toBe(false);
    });

    it("should set dangerouslyAllowBrowser to false in development environment", async () => {
        process.env.NODE_ENV = "development";
        const { getOpenAIClient } = await import("@/lib/ai/openai-client");
        const client = getOpenAIClient();
        // @ts-expect-error accessing private property for testing
        expect(client.client.dangerouslyAllowBrowser).toBe(false);
    });
});
```

- [ ] **Step 3: 运行测试确认当前失败**

```bash
npx vitest run tests/unit/lib/ai/openai-client.test.ts
```

Expected: 测试失败，因为当前代码 hardcode 为 true

- [ ] **Step 4: 修改 openai-client.ts**

Modify `src/lib/ai/openai-client.ts:16-20`:

```typescript
this.client = new OpenAI({
    apiKey,
    baseURL,
    dangerouslyAllowBrowser: process.env.NODE_ENV === "test",
});
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run tests/unit/lib/ai/openai-client.test.ts
```

Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/openai-client.ts tests/unit/lib/ai/openai-client.test.ts
git commit -m "fix(security): only enable dangerouslyAllowBrowser in test environment

- Add environment check to prevent API key exposure in production
- Add unit tests to verify behavior in different environments"
```

---

### Task 2: 修复 allowDangerousEmailAccountLinking 安全问题

**Files:**
- Modify: `src/auth.ts:50-60`
- Test: 检查现有测试

**问题**: `allowDangerousEmailAccountLinking: true` 启用，允许 OIDC 账户自动链接到相同邮箱的现有账户

- [ ] **Step 1: 阅读现有 auth.ts 配置**

```bash
cat src/auth.ts
```

找到 NextAuth 配置中的 `allowDangerousEmailAccountLinking` 设置。

- [ ] **Step 2: 禁用危险配置**

Modify `src/auth.ts` (找到 allowDangerousEmailAccountLinking 所在位置):

```typescript
// Before:
allowDangerousEmailAccountLinking: true,

// After:
// SECURITY: Disabled to prevent account takeover attacks
// Users must manually link accounts after authentication
allowDangerousEmailAccountLinking: false,
```

- [ ] **Step 3: 运行认证相关测试**

```bash
npx vitest run tests/unit/features/auth/ -t "account linking"
```

Expected: 如果存在相关测试，需要更新预期

- [ ] **Step 4: Commit**

```bash
git add src/auth.ts
git commit -m "fix(security): disable allowDangerousEmailAccountLinking

- Prevent OIDC account takeover attacks
- Require explicit account linking flow"
```

---

## Chunk 2: 竞态条件修复

### Task 3: 修复 ExchangeRateService 竞态条件

**Files:**
- Modify: `src/features/currency/server/exchange-rate-service.ts:40-82`
- Test: `tests/unit/features/currency/exchange-rate-service.test.ts` (创建)

**问题**: "检查-然后-执行" 竞态条件，多个并发请求可能同时通过检查

- [ ] **Step 1: 阅读现有代码**

```bash
cat src/features/currency/server/exchange-rate-service.ts
```

- [ ] **Step 2: 编写测试复现竞态条件**

Create `tests/unit/features/currency/exchange-rate-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExchangeRateService } from "@/features/currency/server/exchange-rate-service";
import { db } from "@/lib/db";
import { currencyRates } from "@/features/currency/server/schema";
import { eq } from "drizzle-orm";

describe("ExchangeRateService", () => {
    beforeEach(async () => {
        // Clear cache and database
        await db.delete(currencyRates);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should collapse concurrent requests for the same date", async () => {
        const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            json: async () => ({
                base: "EUR",
                date: "2024-01-15",
                rates: { USD: 1.1, CNY: 7.8 },
            }),
        } as Response);

        // Launch 5 concurrent requests for the same date
        const date = new Date("2024-01-15");
        const promises = Array(5).fill(null).map(() =>
            ExchangeRateService.getRates(date)
        );

        await Promise.all(promises);

        // Should only make one API call due to request collapsing
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle race condition when cache is empty", async () => {
        let callCount = 0;
        vi.spyOn(global, "fetch").mockImplementation(async () => {
            callCount++;
            // Simulate network delay
            await new Promise(r => setTimeout(r, 50));
            return {
                ok: true,
                json: async () => ({
                    base: "EUR",
                    date: "2024-01-20",
                    rates: { USD: 1.2 },
                }),
            } as Response;
        });

        const date = new Date("2024-01-20");

        // Rapid-fire concurrent requests
        const promises = Array(10).fill(null).map(() =>
            ExchangeRateService.getRates(date)
        );

        const results = await Promise.all(promises);

        // All should return the same result
        expect(new Set(results.map(r => r.rates.USD)).size).toBe(1);
        // But only one API call should be made
        expect(callCount).toBe(1);
    });
});
```

- [ ] **Step 3: 运行测试确认当前失败**

```bash
npx vitest run tests/unit/features/currency/exchange-rate-service.test.ts
```

Expected: 第二个测试可能失败（多个 API 调用）

- [ ] **Step 4: 修复竞态条件**

Read `src/features/currency/server/exchange-rate-service.ts` and modify the `getRates` method (around lines 40-82):

```typescript
static async getRates(date?: Date | string): Promise<ExchangeRates> {
    const targetDateStr = this.formatDate(date || new Date());

    // 1. Check cache first
    const cached = await db.query.currencyRates.findFirst({
        where: eq(currencyRates.date, targetDateStr),
    });

    if (cached) {
        return {
            base: cached.base,
            date: cached.date,
            rates: cached.rates as Record<string, number>,
        };
    }

    // 2. Request Collapsing - atomic check-and-set to prevent race condition
    // Check for pending request first (fast path)
    let fetchPromise = this.pendingRequests.get(targetDateStr);

    if (!fetchPromise) {
        // Create the fetch promise immediately, before any await
        // This ensures the pending request is registered atomically
        fetchPromise = this.fetchAndStore(targetDateStr);
        this.pendingRequests.set(targetDateStr, fetchPromise);
    }

    // All concurrent requests will wait on the same promise
    return fetchPromise;
}

// Extract the actual fetch logic to a separate method
private static async fetchAndStore(targetDateStr: string): Promise<ExchangeRates> {
    try {
        const data = await this.fetchWithRetry(
            `${this.API_BASE_URL}/${targetDateStr}?base=EUR`
        );

        // Store in database
        await db.insert(currencyRates)
            .values({
                date: targetDateStr,
                base: data.base,
                rates: data.rates,
            })
            .onConflictDoNothing();

        return data;
    } finally {
        // Clean up pending request
        this.pendingRequests.delete(targetDateStr);
    }
}
```

- [ ] **Step 5: 运行测试确认修复**

```bash
npx vitest run tests/unit/features/currency/exchange-rate-service.test.ts
```

Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add src/features/currency/server/exchange-rate-service.ts tests/unit/features/currency/exchange-rate-service.test.ts
git commit -m "fix(concurrency): fix race condition in ExchangeRateService

- Use atomic check-and-set pattern for request collapsing
- Extract fetch logic to prevent duplicate API calls
- Add tests for concurrent request handling"
```

---

## Chunk 3: 数据库修复

### Task 4: 修复迁移配置错误

**Files:**
- Modify: `drizzle.config.ts`

**问题**: 引用了不存在的 `./src/features/tasks/server/schema.ts`

- [ ] **Step 1: 检查当前配置**

```bash
cat drizzle.config.ts
```

- [ ] **Step 2: 修复配置**

Modify `drizzle.config.ts` (line 28):

```typescript
// Before:
"./src/features/tasks/server/schema.ts",

// After: (删除这一行，因为目录名是 task-queue 不是 tasks)
```

- [ ] **Step 3: 验证配置**

```bash
npx drizzle-kit validate
```

Expected: 配置验证通过

- [ ] **Step 4: Commit**

```bash
git add drizzle.config.ts
git commit -m "fix(db): remove non-existent schema path from drizzle config

- Remove reference to ./src/features/tasks/server/schema.ts
- Correct path is task-queue, not tasks"
```

---

### Task 5: 修复外键约束不一致

**Files:**
- Modify: `src/features/ledger/server/schema.ts:75-77`

**问题**: `ledgerEntries.sourceDocumentId` 定义为 `NOT NULL`，但外键约束设置 `ON DELETE set null`

- [ ] **Step 1: 检查当前 schema**

```bash
cat src/features/ledger/server/schema.ts | grep -A 10 "sourceDocumentId"
```

- [ ] **Step 2: 检查迁移文件**

```bash
grep -n "source_document_id" src/lib/db/migrations/*.sql | tail -5
```

- [ ] **Step 3: 修复 schema**

Modify `src/features/ledger/server/schema.ts` (line 75-77):

```typescript
// Before:
sourceDocumentId: text("source_document_id")
    .notNull()  // This conflicts with ON DELETE set null
    .references(() => sourceDocuments.id, { onDelete: "set null" }),

// After:
sourceDocumentId: text("source_document_id")
    .references(() => sourceDocuments.id, { onDelete: "cascade" }),
```

**说明**: 将 `notNull()` 移除，并将 `onDelete` 改为 `"cascade"`，这样当源文档被删除时，关联的 ledger entries 也会被级联删除（与软删除机制配合使用）。

- [ ] **Step 4: 生成迁移文件**

```bash
npm run db:generate
```

- [ ] **Step 5: 运行测试确认无回归**

```bash
npx vitest run tests/integration/ -t "cascade delete"
```

- [ ] **Step 6: Commit**

```bash
git add src/features/ledger/server/schema.ts src/lib/db/migrations/
git commit -m "fix(db): fix foreign key constraint inconsistency

- Remove notNull() from sourceDocumentId to match onDelete behavior
- Change onDelete from 'set null' to 'cascade' for consistency
- Generate migration to apply schema changes"
```

---

### Task 6: 添加缺失的数据库索引

**Files:**
- Modify: `src/features/ledger/server/schema.ts`
- Modify: `src/features/source-document/server/schema.ts`

**问题**: `convertedAmount` 字段无索引，范围查询需要全表扫描

- [ ] **Step 1: 检查现有索引**

```bash
grep -n "index" src/features/ledger/server/schema.ts
```

- [ ] **Step 2: 添加 convertedAmount 索引**

Modify `src/features/ledger/server/schema.ts` (在 table 定义末尾的 indexes 部分):

```typescript
// Find the indexes section and add:
index("idx_ledger_entries_converted_amount").on(table.convertedAmount),
```

- [ ] **Step 3: 添加复合索引优化租户查询**

```typescript
// Add composite index for tenant isolation queries
index("idx_ledger_entries_ledger_active").on(table.ledgerId, table.deletedAt),
```

- [ ] **Step 4: 生成迁移**

```bash
npm run db:generate
```

- [ ] **Step 5: Commit**

```bash
git add src/features/ledger/server/schema.ts src/lib/db/migrations/
git commit -m "perf(db): add missing indexes for amount queries and tenant isolation

- Add index on convertedAmount for range queries
- Add composite index on (ledgerId, deletedAt) for tenant queries"
```

---

## Chunk 4: 性能修复

### Task 7: 修复 N+1 查询模式

**Files:**
- Modify: `src/features/stats/server/actions/index.ts:223-228`

**问题**: Heatmap 数据生成在循环中过滤数组，O(n*m) 复杂度

- [ ] **Step 1: 阅读现有代码**

```bash
cat src/features/stats/server/actions/index.ts | head -250 | tail -50
```

- [ ] **Step 2: 修改 heatmap 数据生成逻辑**

Find the heatmap generation code (around lines 223-228) and modify:

```typescript
// Before: O(n*m) complexity with filter in loop
const heatmapDays: CalendarDayData[] = Array.from(currentStats.dailyMap.entries()).map(([date, total]) => ({
    date,
    total,
    entryCount: currentEntries.filter(e => e.sourceDocument?.entryDate === date).length,
    currencies: [...new Set(currentEntries.filter(e => e.sourceDocument?.entryDate === date).map(e => e.currency || mainCurrency))],
}));

// After: O(n+m) complexity with pre-grouped data
// Pre-group entries by date
const entriesByDate = new Map<string, typeof currentEntries>();
for (const entry of currentEntries) {
    const date = entry.sourceDocument?.entryDate;
    if (!date) continue;
    if (!entriesByDate.has(date)) {
        entriesByDate.set(date, []);
    }
    entriesByDate.get(date)!.push(entry);
}

const heatmapDays: CalendarDayData[] = Array.from(currentStats.dailyMap.entries()).map(([date, total]) => {
    const dayEntries = entriesByDate.get(date) || [];
    return {
        date,
        total,
        entryCount: dayEntries.length,
        currencies: [...new Set(dayEntries.map(e => e.currency || mainCurrency))],
    };
});
```

- [ ] **Step 3: 运行相关测试**

```bash
npx vitest run tests/unit/features/stats/ tests/integration/stats/
```

- [ ] **Step 4: Commit**

```bash
git add src/features/stats/server/actions/index.ts
git commit -m "perf(stats): fix N+1 query pattern in heatmap generation

- Pre-group entries by date using Map instead of filtering in loop
- Reduce complexity from O(n*m) to O(n+m)"
```

---

## Chunk 5: 输入验证修复

### Task 8: 为批量更新添加 Zod 验证

**Files:**
- Modify: `src/features/ledger/server/actions/entries.ts:176-198`

**问题**: `batchUpdateLedgerEntriesAction` 使用 `Record<string, unknown>` 接受任意输入

- [ ] **Step 1: 阅读现有代码**

```bash
cat src/features/ledger/server/actions/entries.ts | head -210 | tail -50
```

- [ ] **Step 2: 添加 Zod schema 定义**

At the top of `src/features/ledger/server/actions/entries.ts` (after imports, before actions):

```typescript
import { z } from "zod";

// Schema for batch update validation
const batchUpdateLedgerEntriesSchema = z.object({
    categoryId: z.string().uuid().optional(),
    currency: z.string().length(3).optional(), // ISO 4217 currency code
    amount: z.number().positive().optional(),
    description: z.string().max(500).optional(),
}).strict(); // Reject unknown keys
```

- [ ] **Step 3: 修改 batchUpdateLedgerEntriesAction**

Find and modify the function:

```typescript
export async function batchUpdateLedgerEntriesAction(
    ledgerId: string,
    ledgerEntryIds: string[],
    data: z.infer<typeof batchUpdateLedgerEntriesSchema>
): Promise<void> {
    const { error } = await requireLedgerAccess(ledgerId);
    if (error) throw new Error("Unauthorized: Access to ledger denied");

    // Validate input with Zod
    const validated = batchUpdateLedgerEntriesSchema.parse(data);

    // Build update data from validated input
    const updateData: Partial<typeof ledgerEntries.$inferSelect> = {};
    if (validated.categoryId !== undefined) updateData.categoryId = validated.categoryId;
    if (validated.currency !== undefined) updateData.currency = validated.currency;
    if (validated.amount !== undefined) updateData.amount = validated.amount;
    if (validated.description !== undefined) updateData.description = validated.description;

    // ... rest of the function
}
```

- [ ] **Step 4: 运行测试确认验证工作**

```bash
npx vitest run tests/integration/ledger/ -t "batch update"
```

- [ ] **Step 5: Commit**

```bash
git add src/features/ledger/server/actions/entries.ts
git commit -m "fix(validation): add Zod validation to batchUpdateLedgerEntriesAction

- Add strict schema validation for batch update inputs
- Reject unknown keys to prevent unintended updates
- Validate UUID format, currency code length, and amount positivity"
```

---

## 验证清单

所有任务完成后运行最终验证：

```bash
# 运行所有测试
npm run test:run

# 运行 TypeScript 检查
npx tsc --noEmit

# 运行 ESLint
npm run lint

# 验证数据库配置
npx drizzle-kit validate
```

---

## 总结

本计划修复以下高优先级问题：

| 问题 | 优先级 | 状态 |
|------|--------|------|
| dangerouslyAllowBrowser 安全问题 | 🔴 Critical | ✅ 修复 |
| allowDangerousEmailAccountLinking | 🔴 Critical | ✅ 修复 |
| Schema 外键约束不一致 | 🔴 Critical | ✅ 修复 |
| 迁移配置错误 | 🔴 Critical | ✅ 修复 |
| ExchangeRateService 竞态条件 | 🟠 High | ✅ 修复 |
| N+1 查询模式 | 🟠 High | ✅ 修复 |
| 缺少数据库索引 | 🟠 High | ✅ 修复 |
| 批量更新缺乏验证 | 🟠 High | ✅ 修复 |

**约束遵守情况**:
- ✅ 未改动 AI 流程（Stage 1/2 保持不变）
- ✅ 未添加 Service 层（保持现有 Server Actions 架构）
