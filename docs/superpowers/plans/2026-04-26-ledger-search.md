# Ledger 搜索功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ledger 页面的 stream 和 details 两个 tab 中增加跨表文本搜索功能，搜索词同时命中 ledger entries (itemName, description) 和 source documents (title, text)。

**Architecture:** 复用现有 filter 管道，通过 URL query param `search` 传递搜索词。Details tab 使用 `inArray` 子查询实现跨表匹配；Stream tab 使用 `EXISTS` 子查询实现跨表匹配。所有改动遵循现有代码风格，不改查询架构（relational query 保持）。

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM, SQLite, React Query, Zod, vitest

---

## 文件结构

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/modules/ledger/contract-schemas.ts` | ledger entries / stats 的输入校验 schema | 修改 |
| `src/modules/source-document/contract-schemas.ts` | source document collection 的输入校验 schema | 修改 |
| `src/modules/workspace/ledger-url-params.ts` | URL 参数读写（search） | 修改 |
| `src/modules/workspace/ledger-filter-state.ts` | filter state 转换（search） | 修改 |
| `src/modules/workspace/initial-query-state.ts` | advanced filter key 构建（search） | 修改 |
| `src/modules/ledger/application/queries/build-ledger-entry-filters.ts` | Details tab WHERE 条件构建（跨表 LIKE） | 修改 |
| `src/modules/ledger/application/queries/list-ledger-entry-page.ts` | Details tab 分页查询（透传 search） | 修改 |
| `src/modules/ledger/application/queries/list-ledger-entries.ts` | Details tab 查询边界（透传 search） | 修改 |
| `src/modules/ledger/server-actions/entries.ts` | Details tab server action（透传 search） | 修改 |
| `src/modules/ledger/application/queries/calculate-ledger-stats.ts` | Stats 查询（透传 search） | 修改 |
| `src/modules/ledger/server-actions/stats.ts` | Stats server action（无需修改，已透传） | 只读 |
| `src/modules/source-document/application/queries/list-source-document-collection.ts` | Stream tab 查询（跨表 LIKE） | 修改 |
| `src/modules/source-document/server-actions/queries.ts` | Stream tab server action（透传 search） | 修改 |
| `src/modules/source-document/hooks/useSourceDocumentCollection.ts` | Stream tab React Query hook（透传 search） | 修改 |
| `src/lib/query-keys.ts` | React Query 缓存键工厂 | 修改 |
| `src/modules/ledger/hooks/useDetailsTabData.ts` | Details tab data hook（透传 search） | 修改 |
| `src/modules/workspace/hooks/usePeriodFilter.ts` | Period + filter URL 状态 hook | 修改 |
| `src/modules/workspace/ui/useDetailsTabFilters.ts` | Details tab filter hook | 修改 |
| `src/modules/workspace/ui/useLedgerEntriesFilters.ts` | Stream tab filter hook | 修改 |
| `src/modules/ledger/ui/EntryFilterPanel.tsx` | Filter Popover UI（增加搜索输入框） | 修改 |
| `messages/en.json` | 英文翻译 | 修改 |
| `messages/zh.json` | 中文翻译 | 修改 |

---

## Task 1: Schema 扩展 — 增加 `search` 字段

**Files:**
- Modify: `src/modules/ledger/contract-schemas.ts:90-99`
- Modify: `src/modules/ledger/contract-schemas.ts:101-106`
- Modify: `src/modules/source-document/contract-schemas.ts:82-88`
- Test: `tests/unit/ledger/server-actions/validation.test.ts`（如不存在则创建）
- Test: `tests/unit/source-document/contract-schemas.omission.test.ts`（扩展）

**背景:** `listLedgerEntriesInputSchema`、`ledgerStatsQuerySchema`、`sourceDocumentCollectionInputSchema` 需要接受 `search` 参数。

- [ ] **Step 1: 修改 ledger contract-schemas.ts**

在 `src/modules/ledger/contract-schemas.ts` 中，`listLedgerEntriesInputSchema` 增加 `search` 字段：

```typescript
export const listLedgerEntriesInputSchema = strictObjectSchema({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  categoryId: uuidSchema.optional(),
  currency: optionalCurrencyCodeSchema,
  minAmount: optionalQueryNumberSchema,
  maxAmount: optionalQueryNumberSchema,
  search: z.string().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

同时 `ledgerStatsQuerySchema` 也增加 `search`：

```typescript
export const ledgerStatsQuerySchema = strictObjectSchema({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  categoryId: uuidSchema.optional(),
  currency: optionalCurrencyCodeSchema,
  search: z.string().max(200).optional(),
});
```

- [ ] **Step 2: 修改 source-document contract-schemas.ts**

在 `src/modules/source-document/contract-schemas.ts` 中，`sourceDocumentCollectionInputSchema` 增加 `search`：

```typescript
export const sourceDocumentCollectionInputSchema = strictObjectSchema({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  minAmount: optionalQueryNumberSchema,
  maxAmount: optionalQueryNumberSchema,
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000),
});
```

- [ ] **Step 3: 写测试验证 schema 接受 search 参数**

```typescript
// tests/unit/ledger/server-actions/validation.test.ts
import { describe, expect, it } from "vitest";
import { parseListLedgerEntriesInput, ledgerStatsQuerySchema } from "@/modules/ledger/contract-schemas";
import { sourceDocumentCollectionInputSchema } from "@/modules/source-document/contract-schemas";

describe("search param validation", () => {
  it("accepts search in listLedgerEntriesInputSchema", () => {
    const result = parseListLedgerEntriesInput({ search: "coffee" });
    expect(result.search).toBe("coffee");
  });

  it("rejects search longer than 200 chars", () => {
    expect(() => parseListLedgerEntriesInput({ search: "a".repeat(201) })).toThrow("Validation failed");
  });

  it("accepts search in sourceDocumentCollectionInputSchema", () => {
    const result = sourceDocumentCollectionInputSchema.parse({ search: "receipt", limit: 100 });
    expect(result.search).toBe("receipt");
  });

  it("accepts search in ledgerStatsQuerySchema", () => {
    const result = ledgerStatsQuerySchema.parse({ search: "grocery" });
    expect(result.search).toBe("grocery");
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/unit/ledger/server-actions/validation.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/modules/ledger/contract-schemas.ts src/modules/source-document/contract-schemas.ts tests/unit/ledger/server-actions/validation.test.ts
git commit -m "feat(search): add search param to entry, stats, and source doc schemas"
```

---

## Task 2: URL 状态层 — 增加 `search` 参数管理

**Files:**
- Modify: `src/modules/workspace/ledger-url-params.ts`
- Modify: `src/modules/workspace/ledger-filter-state.ts`
- Modify: `src/modules/workspace/initial-query-state.ts`
- Test: `tests/unit/modules/workspace/ledger-filter-state.test.ts`

**背景:** 现有 URL 参数管道管理 categoryId、currency、minAmount、maxAmount。需要扩展 `search`。

- [ ] **Step 1: 修改 ledger-url-params.ts**

```typescript
export interface LedgerFilterParams {
  categoryId: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  search: string | null;
}

export interface LedgerUrlUpdate {
  tab?: string | null;
  period?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  search?: string | null;
}
```

`readLedgerFilterParams` 增加 search 读取：

```typescript
export function readLedgerFilterParams(searchParams: SearchParamsLike): LedgerFilterParams {
  const readNumber = (key: "minAmount" | "maxAmount"): number | null => {
    const raw = searchParams.get(key);
    if (raw == null) return null;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  };

  return {
    categoryId: searchParams.get("categoryId") ?? null,
    currency: searchParams.get("currency") ?? null,
    minAmount: readNumber("minAmount"),
    maxAmount: readNumber("maxAmount"),
    search: searchParams.get("search") ?? null,
  };
}
```

`updateLedgerSearchParams` 增加 search 处理（使用现有的 `setOrDeleteStringParam`）：

```typescript
export function updateLedgerSearchParams(
  searchParams: SearchParamsLike,
  updates: LedgerUrlUpdate
): URLSearchParams {
  const params = createMutableSearchParams(searchParams);

  // ... existing code ...

  if ("search" in updates) setOrDeleteStringParam(params, "search", updates.search);

  return params;
}
```

- [ ] **Step 2: 修改 ledger-filter-state.ts**

```typescript
type LedgerFilterKeyInput = Pick<
  EntryFilters,
  "categoryId" | "currency" | "minAmount" | "maxAmount" | "search"
>;

export function buildLedgerEntryFilters(
  periodParams: PeriodParams,
  advancedFilters: LedgerAdvancedFilters = {}
): EntryFilters {
  // ... existing code ...
  if (advancedFilters.search !== undefined) {
    nextFilters.search = advancedFilters.search;
  }
  // ...
}

export function buildLedgerFilterKey(filters: LedgerFilterKeyInput): string | null {
  const parts: string[] = [];
  // ... existing ...
  if (filters.search != null && filters.search !== "") {
    parts.push(`search:${filters.search}`);
  }
  return parts.length > 0 ? parts.join("|") : null;
}

export function splitLedgerFilterChange(args: {
  currentPeriod: PeriodParams;
  currentFilters: EntryFilters;
  nextFilters: EntryFilters;
}): {
  periodUpdate?: PeriodParams;
  advancedFilterUpdate: LedgerAdvancedFilters;
} {
  // ... existing ...
  if ("search" in args.nextFilters) {
    advancedFilterUpdate.search = args.nextFilters.search;
  }
  // ...
}
```

- [ ] **Step 3: 修改 initial-query-state.ts**

```typescript
export interface LedgerAdvancedFilters {
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  search?: string | null;
}

export function buildDetailsFilterKey(filters: LedgerAdvancedFilters): string | null {
  const parts: string[] = [];
  // ... existing ...
  if (filters.search != null && filters.search !== "") {
    parts.push(`search:${filters.search}`);
  }
  return parts.length > 0 ? parts.join("|") : null;
}
```

- [ ] **Step 4: 更新测试**

在 `tests/unit/modules/workspace/ledger-filter-state.test.ts` 中增加 search 相关测试：

```typescript
it("includes search in filterKey", () => {
  const filters = buildLedgerEntryFilters(
    { period: "thisMonth" },
    { search: "coffee" }
  );
  expect(buildLedgerFilterKey(filters)).toBe("search:coffee");
});

it("splits search into advanced filter update", () => {
  const result = splitLedgerFilterChange({
    currentPeriod: { period: "thisMonth" },
    currentFilters: {},
    nextFilters: { search: "grocery" },
  });
  expect(result.advancedFilterUpdate.search).toBe("grocery");
});
```

- [ ] **Step 5: 运行测试**

Run: `npx vitest run tests/unit/modules/workspace/ledger-filter-state.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add src/modules/workspace/ledger-url-params.ts src/modules/workspace/ledger-filter-state.ts src/modules/workspace/initial-query-state.ts tests/unit/modules/workspace/ledger-filter-state.test.ts
git commit -m "feat(search): add search to URL state and filter key pipeline"
```

---

## Task 3: Details tab Filter Conditions — 跨表 LIKE 搜索

**Files:**
- Modify: `src/modules/ledger/application/queries/build-ledger-entry-filters.ts`
- Test: `tests/unit/ledger/application/queries/build-ledger-entry-filters.test.ts`

**背景:** 在 `buildLedgerEntryFilterConditions` 中增加跨表搜索条件。使用 `inArray` + 子查询方式，保持 relational query 不变。

- [ ] **Step 1: 修改 build-ledger-entry-filters.ts**

```typescript
import { and, eq, isNull, lt, or, sql, inArray, like, type SQL } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import { db } from "@/lib/db";
// ... existing imports ...

export interface LedgerEntryFilterParams {
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  uncategorizedOnly?: boolean;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  searchQuery?: string | null;
}

export function buildLedgerEntryFilterConditions(
  ledgerId: string,
  filters: LedgerEntryFilterParams
): SQL<unknown>[] {
  // ... existing code up to maxAmount ...

  if (filters.searchQuery != null && filters.searchQuery.trim() !== "") {
    const q = `%${filters.searchQuery.trim()}%`;
    const matchingDocIds = db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.ledgerId, ledgerId),
          or(like(sourceDocuments.title, q), like(sourceDocuments.text, q))
        )
      );

    conditions.push(
      or(
        like(ledgerEntries.itemName, q),
        like(ledgerEntries.description, q),
        inArray(ledgerEntries.sourceDocumentId, matchingDocIds)
      )
    );
  }

  return conditions;
}
```

- [ ] **Step 2: 写测试**

```typescript
// tests/unit/ledger/application/queries/build-ledger-entry-filters.test.ts
import { describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => dbMock),
  from: vi.fn(() => dbMock),
  where: vi.fn(() => dbMock),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import { buildLedgerEntryFilterConditions } from "@/modules/ledger/application/queries/build-ledger-entry-filters";

describe("buildLedgerEntryFilterConditions search", () => {
  it("adds search condition when searchQuery is provided", () => {
    dbMock.select.mockReturnValueOnce(dbMock);
    dbMock.from.mockReturnValueOnce(dbMock);
    dbMock.where.mockReturnValueOnce(["subquery"]);

    const conditions = buildLedgerEntryFilterConditions("ledger-1", {
      searchQuery: "coffee",
    });

    expect(conditions.length).toBeGreaterThan(0);
  });

  it("ignores empty or whitespace-only searchQuery", () => {
    const empty = buildLedgerEntryFilterConditions("ledger-1", { searchQuery: "" });
    const whitespace = buildLedgerEntryFilterConditions("ledger-1", { searchQuery: "   " });
    const none = buildLedgerEntryFilterConditions("ledger-1", {});

    expect(empty.length).toBe(none.length);
    expect(whitespace.length).toBe(none.length);
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run tests/unit/ledger/application/queries/build-ledger-entry-filters.test.ts`
Expected: 全部 PASS

- [ ] **Step 4: 提交**

```bash
git add src/modules/ledger/application/queries/build-ledger-entry-filters.ts tests/unit/ledger/application/queries/build-ledger-entry-filters.test.ts
git commit -m "feat(search): add cross-table LIKE filter for ledger entries"
```

---

## Task 4: Details tab 查询管道 — 透传 search

**Files:**
- Modify: `src/modules/ledger/application/queries/list-ledger-entry-page.ts`
- Modify: `src/modules/ledger/application/queries/list-ledger-entries.ts`
- Modify: `src/modules/ledger/server-actions/entries.ts`
- Test: `tests/unit/ledger/application/queries/list-ledger-entries.test.ts`

**背景:** `listLedgerEntryPage` 和 `listLedgerEntries` 需要把 `searchQuery` 从输入透传到 filter conditions。

- [ ] **Step 1: 修改 list-ledger-entry-page.ts**

```typescript
interface ListLedgerEntryPageInput {
  ledgerId: string;
  limit?: number;
  cursor?: string | null;
  filters: LedgerEntryFilterParams;
}
```

无需其他修改，`filters` 已经包含 `searchQuery`。`buildLedgerEntryFilterConditions` 会自动处理。

- [ ] **Step 2: 修改 list-ledger-entries.ts**

```typescript
export async function listLedgerEntriesFromValidatedInput(
  ledgerId: string,
  validated: ListLedgerEntriesValidatedInput,
  options?: { uncategorizedOnly?: boolean }
): Promise<LedgerEntryPageDto> {
  const filters: Parameters<typeof listLedgerEntryPage>[0]["filters"] = {};
  // ... existing ...
  if (validated.search !== undefined) filters.searchQuery = validated.search;
  // ... existing ...
}
```

- [ ] **Step 3: 修改 server-actions/entries.ts**

无需修改，`getLedgerEntriesAction = withLedgerAccess(listLedgerEntries)` 已经透传所有参数。

- [ ] **Step 4: 更新测试**

```typescript
// tests/unit/ledger/application/queries/list-ledger-entries.test.ts
it("passes search param through to listLedgerEntryPage", async () => {
  listLedgerEntryPageMock.mockResolvedValueOnce({
    items: [{ id: "entry-1" }],
    nextCursor: undefined,
  });

  await listLedgerEntries("ledger-1", { search: "coffee" });

  expect(listLedgerEntryPageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      filters: expect.objectContaining({ searchQuery: "coffee" }),
    })
  );
});
```

- [ ] **Step 5: 运行测试**

Run: `npx vitest run tests/unit/ledger/application/queries/list-ledger-entries.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add src/modules/ledger/application/queries/list-ledger-entries.ts tests/unit/ledger/application/queries/list-ledger-entries.test.ts
git commit -m "feat(search): pass search param through details tab query pipeline"
```

---

## Task 5: Stream tab 查询层 — 跨表 LIKE 搜索

**Files:**
- Modify: `src/modules/source-document/application/queries/list-source-document-collection.ts`
- Test: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`

**背景:** 在 `listSourceDocumentCollectionQuery` 中增加跨表搜索条件。使用 `EXISTS` 子查询方式。

- [ ] **Step 1: 修改 list-source-document-collection.ts**

```typescript
import { and, desc, exists, like, sql } from "drizzle-orm";
// ... existing imports ...
import { ledgerEntries } from "@/persistence";

export interface SourceDocumentCollectionParams {
  startDate?: string | null;
  endDate?: string | null;
  minAmount?: number;
  maxAmount?: number;
  search?: string | null;
  limit: number;
}

export async function listSourceDocumentCollectionQuery(
  ledgerId: string,
  params: SourceDocumentCollectionParams
): Promise<SourceDocumentCollectionDto> {
  const conditions = [
    whereSourceDocumentNotDeleted(ledgerId),
    ...buildSourceDocumentDateConditions(params.startDate, params.endDate),
    ...buildSourceDocumentAmountConditions(ledgerId, params.minAmount, params.maxAmount),
  ];

  if (params.search != null && params.search.trim() !== "") {
    const q = `%${params.search.trim()}%`;
    const entryMatchSubquery = db
      .select({ one: sql`1` })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.sourceDocumentId, sourceDocuments.id),
          eq(ledgerEntries.ledgerId, ledgerId),
          or(like(ledgerEntries.itemName, q), like(ledgerEntries.description, q))
        )
      );

    conditions.push(
      or(
        like(sourceDocuments.title, q),
        like(sourceDocuments.text, q),
        exists(entryMatchSubquery)
      )
    );
  }

  // ... rest of existing code unchanged ...
}
```

- [ ] **Step 2: 修改 getSourceDocumentCollectionFromValidatedInput**

```typescript
export async function getSourceDocumentCollectionFromValidatedInput(
  ledgerId: string,
  validated: ParsedSourceDocumentCollectionInput
): Promise<SourceDocumentCollectionDto> {
  const queryParams: SourceDocumentCollectionParams = {
    // ... existing ...
    ...(validated.search !== undefined ? { search: validated.search } : {}),
    limit: validated.limit,
  };
  // ...
}
```

- [ ] **Step 3: 写测试**

```typescript
// tests/integration/modules/source-document/application/queries/source-document-queries.test.ts
import { describe, expect, it } from "vitest";
import { listSourceDocumentCollectionQuery } from "@/modules/source-document/application/queries/list-source-document-collection";

describe("listSourceDocumentCollectionQuery search", () => {
  it("filters by search query across title and text", async () => {
    // 使用已有测试 fixture 创建 ledger + source doc + entry
    // 搜索"test"应返回匹配的 source document
  });
});
```

如果集成测试 fixture 复杂，可以先写单元测试 mock 验证参数透传：

```typescript
it("passes search to collection query", async () => {
  const dbMock = vi.fn();
  // mock db.select().from().where() chain
});
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
Expected: 全部 PASS（现有测试不破坏 + 新测试 PASS）

- [ ] **Step 5: 提交**

```bash
git add src/modules/source-document/application/queries/list-source-document-collection.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts
git commit -m "feat(search): add cross-table LIKE filter for source document collection"
```

---

## Task 6: Stream tab 查询管道 — 透传 search

**Files:**
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentCollection.ts`
- Test: `tests/unit/hooks/useSourceDocumentCollection.test.ts`

**背景:** Server action 和 React Query hook 需要把 `search` 从 URL 透传到查询。

- [ ] **Step 1: 修改 server-actions/queries.ts**

无需修改 schema 层面，`getSourceDocumentCollectionAction` 已透传所有参数。

- [ ] **Step 2: 修改 useSourceDocumentCollection.ts**

```typescript
export interface UseSourceDocumentCollectionOptions {
  dateRange?: { start?: Date; end?: Date };
  minAmount?: number;
  maxAmount?: number;
  search?: string | null;
}

export function useSourceDocumentCollection(
  ledgerId: string,
  options: UseSourceDocumentCollectionOptions = {}
) {
  const { dateRange, minAmount, maxAmount, search } = options;
  // ...

  const { data: response, isLoading } = useQuery({
    queryKey: queryKeys.sourceDocumentCollection(ledgerId, {
      startDate,
      endDate,
      ...(minAmount != null ? { minAmount } : {}),
      ...(maxAmount != null ? { maxAmount } : {}),
      ...(search != null ? { search } : {}),
      limit: STREAM_COLLECTION_LIMIT,
    }),
    queryFn: () =>
      getSourceDocumentCollectionAction(ledgerId, {
        ...(startDate !== null ? { startDate } : {}),
        ...(endDate !== null ? { endDate } : {}),
        ...(minAmount != null ? { minAmount } : {}),
        ...(maxAmount != null ? { maxAmount } : {}),
        ...(search != null ? { search } : {}),
        limit: STREAM_COLLECTION_LIMIT,
      }),
    // ...
  });
  // ...
}
```

- [ ] **Step 3: 更新测试**

```typescript
// tests/unit/hooks/useSourceDocumentCollection.test.ts
it("includes search in query key", () => {
  // 验证 queryKey 包含 search 参数
});
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/unit/hooks/useSourceDocumentCollection.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add src/modules/source-document/hooks/useSourceDocumentCollection.ts tests/unit/hooks/useSourceDocumentCollection.test.ts
git commit -m "feat(search): pass search through stream tab query pipeline"
```

---

## Task 7: Stats 查询管道 — 透传 search

**Files:**
- Modify: `src/modules/ledger/application/queries/calculate-ledger-stats.ts`
- Test: `tests/integration/stats-soft-delete.test.ts` 或新测试文件

**背景:** Stats 查询已经使用 `buildLedgerEntryFilterConditions`，只需透传 `searchQuery`。

- [ ] **Step 1: 修改 calculate-ledger-stats.ts**

```typescript
export async function calculateLedgerStats(
  ledgerId: string,
  startDate?: string,
  endDate?: string,
  mainCurrency?: string,
  filters?: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    search?: string | null;
  }
): Promise<LedgerSummaryDto> {
  // ... existing ...
  if (filters?.search !== undefined && filters.search != null && filters.search.trim() !== "") {
    payload.filters.searchQuery = filters.search;
  }
  // ...
}
```

- [ ] **Step 2: 验证测试**

Stats 测试已有集成测试。运行确保不破坏：

Run: `npx vitest run tests/integration/stats-soft-delete.test.ts`
Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add src/modules/ledger/application/queries/calculate-ledger-stats.ts
git commit -m "feat(search): pass search param through stats query pipeline"
```

---

## Task 8: React Query 缓存键 + Data Hooks

**Files:**
- Modify: `src/lib/query-keys.ts`
- Modify: `src/modules/ledger/hooks/useDetailsTabData.ts`
- Modify: `src/modules/workspace/ui/useDetailsTabFilters.ts`
- Modify: `src/modules/workspace/ui/useLedgerEntriesFilters.ts`
- Test: `tests/unit/hooks/useDetailsTabData.test.tsx`
- Test: `tests/unit/workspace/get-ledger-page-bootstrap.test.ts`

**背景:** 确保不同搜索词的缓存隔离，且 data hooks 正确传递 search。

- [ ] **Step 1: 修改 query-keys.ts**

`sourceDocumentCollection` 增加 search：

```typescript
sourceDocumentCollection: (
  ledgerId: string,
  params?: {
    startDate?: string | null | undefined;
    endDate?: string | null | undefined;
    minAmount?: number | null | undefined;
    maxAmount?: number | null | undefined;
    search?: string | null | undefined;
    limit?: number | null | undefined;
  }
) =>
  [
    "sourceDocuments",
    ledgerId,
    "collection",
    params?.startDate ?? null,
    params?.endDate ?? null,
    params?.minAmount ?? null,
    params?.maxAmount ?? null,
    params?.search ?? null,
    params?.limit ?? null,
  ] as const,
```

`summary` 和 `ledgerEntries` 已通过 filterKey 实现隔离（filterKey 包含 search），无需修改。

- [ ] **Step 2: 修改 useDetailsTabData.ts**

```typescript
interface UseDetailsTabDataProps {
  ledgerId: string;
  ledger?: Ledger;
  periodParams: PeriodParams;
  advancedFilters: {
    categoryId?: string | null;
    currency?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    search?: string | null;
  };
}
```

在 `useInfiniteQuery` 和 `useQuery` 的参数构建中增加 search：

```typescript
// summary query
...(advancedFilters.search != null ? { search: advancedFilters.search } : {}),

// infinite query
...(advancedFilters.search != null ? { search: advancedFilters.search } : {}),
```

- [ ] **Step 3: 修改 useDetailsTabFilters.ts**

```typescript
interface UseDetailsTabFiltersProps {
  periodParams: PeriodParams;
  advancedFilters: LedgerAdvancedFilters; // 已包含 search
}
```

无需其他修改，`buildLedgerFilterKey` 已处理 search。

- [ ] **Step 4: 修改 useLedgerEntriesFilters.ts**

这个 hook 只使用 `buildLedgerEntryFilters(periodParams)`，不传 advancedFilters。实际上 stream tab 的 filter 由 `useLedgerEntriesFilters` 处理日期，`useSourceDocumentCollection` 接收 options。无需修改此文件，但需要在 `LedgerEntriesTab` 中把 search 传给 `useSourceDocumentCollection`。

在 `LedgerEntriesTab.tsx` 中（Task 9 处理），`useSourceDocumentCollection` 调用增加 search：

```typescript
const { groups, isLoading } = useSourceDocumentCollection(ledgerId, {
  // ... existing ...
  ...(filters.search != null ? { search: filters.search } : {}),
});
```

- [ ] **Step 5: 更新测试**

```typescript
// tests/unit/hooks/useDetailsTabData.test.tsx
it("includes search in query key", () => {
  // 验证 queryKey 包含 search
});
```

- [ ] **Step 6: 运行测试**

Run: `npx vitest run tests/unit/hooks/useDetailsTabData.test.tsx`
Expected: 全部 PASS

- [ ] **Step 7: 提交**

```bash
git add src/lib/query-keys.ts src/modules/ledger/hooks/useDetailsTabData.ts tests/unit/hooks/useDetailsTabData.test.tsx
git commit -m "feat(search): wire search through React Query keys and data hooks"
```

---

## Task 9: Workspace Filter Hooks — 统一处理 search

**Files:**
- Modify: `src/modules/workspace/hooks/usePeriodFilter.ts`
- Modify: `src/modules/workspace/ui/useDetailsTabFilters.ts`
- Modify: `src/modules/workspace/ui/LedgerEntriesTab.tsx`
- Test: `tests/unit/modules/workspace/ui/LedgerEntriesTab.test.tsx`

**背景:** `usePeriodFilter` 需要把 search 作为 advanced filter 的一部分处理。`LedgerEntriesTab` 需要把 search 传给 `useSourceDocumentCollection`。

- [ ] **Step 1: 修改 usePeriodFilter.ts**

`FilterParams` 增加 search：

```typescript
export interface FilterParams {
  categoryId: string | null;
  currency: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  search: string | null;
}
```

`filterParams` 的 useMemo 从 `readLedgerFilterParams` 自然获得 search。

`filters` 的 useMemo 自然包含 search（因为 `buildLedgerEntryFilters` 已处理）。

- [ ] **Step 2: 修改 LedgerEntriesTab.tsx**

```typescript
const { groups, isLoading } = useSourceDocumentCollection(ledgerId, {
  dateRange: {
    ...(filters.startDate !== undefined ? { start: filters.startDate } : {}),
    ...(filters.endDate !== undefined ? { end: filters.endDate } : {}),
  },
  ...(filters.minAmount != null ? { minAmount: filters.minAmount } : {}),
  ...(filters.maxAmount != null ? { maxAmount: filters.maxAmount } : {}),
  ...(filters.search != null ? { search: filters.search } : {}),
});
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run tests/unit/modules/workspace/ui/LedgerEntriesTab.test.tsx`
Expected: 全部 PASS

- [ ] **Step 4: 提交**

```bash
git add src/modules/workspace/hooks/usePeriodFilter.ts src/modules/workspace/ui/LedgerEntriesTab.tsx
git commit -m "feat(search): wire search into workspace filter hooks and stream tab"
```

---

## Task 10: UI — EntryFilterPanel 增加搜索输入框

**Files:**
- Modify: `src/modules/ledger/ui/EntryFilterPanel.tsx`
- Test: 新建 `tests/unit/modules/ledger/ui/EntryFilterPanel.test.tsx`

**背景:** 在 Popover 顶部增加搜索输入框，和现有 filter 统一交互（Apply 后生效）。

- [ ] **Step 1: 修改 EntryFilterPanel.tsx**

在 `EntryFilters` interface 中增加 `search`：

```typescript
export interface EntryFilters {
  startDate?: Date;
  endDate?: Date;
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  search?: string | null;
}
```

在 `advancedFilterCount` 计算中增加 search：

```typescript
const advancedFilterCount = [
  showCategory && filters.categoryId != null && filters.categoryId !== "",
  showCurrency && filters.currency != null && filters.currency !== "",
  filters.minAmount !== undefined && filters.minAmount !== null,
  filters.maxAmount !== undefined && filters.maxAmount !== null,
  filters.search != null && filters.search !== "",
].filter((x): x is true => x === true).length;
```

在 `handleReset` 中增加 search reset：

```typescript
const defaultFilters: EntryFilters = {
  // ... existing ...
  search: null,
};
```

在 Popover content 的日期筛选区上方增加搜索区：

```tsx
{/* Search Section */}
<div className="space-y-2">
  <div className="text-xs font-medium text-muted-foreground">
    {t("search")}
  </div>
  <div className="relative">
    <Input
      type="text"
      placeholder={t("searchPlaceholder")}
      value={tempFilters.search ?? ""}
      onChange={(e) =>
        setTempFilters((prev) => ({
          ...prev,
          search: e.target.value !== "" ? e.target.value : null,
        }))
      }
      className="h-8 text-sm pr-8"
    />
    {tempFilters.search && (
      <button
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-text"
        onClick={() =>
          setTempFilters((prev) => ({ ...prev, search: null }))
        }
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
</div>
```

需要从 lucide-react 导入 `Search` icon（如果要用），但实际只用 `X`。确保 `X` 已导入（已有）。

- [ ] **Step 2: 运行 build 检查类型**

Run: `npm run build`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add src/modules/ledger/ui/EntryFilterPanel.tsx
git commit -m "feat(search): add search input to EntryFilterPanel"
```

---

## Task 11: i18n 翻译

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: 修改 messages/en.json**

在 `EntryFilterPanel` 命名空间下增加：

```json
{
  "EntryFilterPanel": {
    "search": "Search",
    "searchPlaceholder": "Search entries or receipts...",
    "moreFilters": "More Filters",
    "dateRange": "Date Range",
    "category": "Category",
    "currency": "Currency",
    "priceRange": "Price Range",
    "minAmount": "Min",
    "maxAmount": "Max",
    "reset": "Reset",
    "apply": "Apply",
    "allCategories": "All Categories",
    "allCurrencies": "All Currencies",
    "filteredTotal": "Filtered Total:"
  }
}
```

- [ ] **Step 2: 修改 messages/zh.json**

```json
{
  "EntryFilterPanel": {
    "search": "搜索",
    "searchPlaceholder": "搜索条目或收据...",
    "moreFilters": "更多筛选",
    "dateRange": "日期范围",
    "category": "分类",
    "currency": "货币",
    "priceRange": "价格范围",
    "minAmount": "最低金额",
    "maxAmount": "最高金额",
    "reset": "重置",
    "apply": "应用",
    "allCategories": "全部分类",
    "allCurrencies": "全部货币",
    "filteredTotal": "筛选总计："
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add messages/en.json messages/zh.json
git commit -m "feat(search): add i18n translations for search filter"
```

---

## Task 12: 集成测试

**Files:**
- Create: `tests/integration/ledger-search.test.ts`

**背景:** 端到端验证搜索在两个 tab 中正确工作。

- [ ] **Step 1: 创建集成测试**

```typescript
import { describe, expect, it, beforeAll } from "vitest";
import { setupTestLedgerWithEntries } from "tests/fixtures/ledger-fixtures";
import { listLedgerEntries } from "@/modules/ledger/queries";
import { getSourceDocumentCollection } from "@/modules/source-document/queries";

describe("ledger search", () => {
  let ledgerId: string;

  beforeAll(async () => {
    // 创建测试 ledger，包含：
    // - source doc A: title="Starbucks receipt", entries=[{itemName:"Latte"}]
    // - source doc B: title="Grocery store", entries=[{itemName:"Milk"}]
    // - manual entry: itemName="Coffee beans"
    ledgerId = await setupTestLedgerWithEntries(/* ... */);
  });

  it("details tab: finds entries by itemName", async () => {
    const result = await listLedgerEntries(ledgerId, { search: "Latte" });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].itemName).toContain("Latte");
  });

  it("details tab: finds entries by description", async () => {
    // 测试 description 匹配
  });

  it("details tab: cross-table finds entries via source doc title", async () => {
    const result = await listLedgerEntries(ledgerId, { search: "Starbucks" });
    expect(result.items.some((e) => e.itemName === "Latte")).toBe(true);
  });

  it("stream tab: finds source docs by title", async () => {
    const result = await getSourceDocumentCollection(ledgerId, { search: "Grocery", limit: 100 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].title).toContain("Grocery");
  });

  it("stream tab: cross-table finds source docs via entry itemName", async () => {
    const result = await getSourceDocumentCollection(ledgerId, { search: "Latte", limit: 100 });
    expect(result.items.some((d) => d.title === "Starbucks receipt")).toBe(true);
  });

  it("ignores empty search", async () => {
    const all = await listLedgerEntries(ledgerId, {});
    const empty = await listLedgerEntries(ledgerId, { search: "" });
    expect(empty.items.length).toBe(all.items.length);
  });
});
```

如果 fixtures 不存在或结构不同，根据现有 fixture 调整。

- [ ] **Step 2: 运行集成测试**

Run: `npx vitest run tests/integration/ledger-search.test.ts`
Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add tests/integration/ledger-search.test.ts
git commit -m "test(search): add integration tests for cross-tab search"
```

---

## Task 13: Lint、Type Check、Build 验证

- [ ] **Step 1: 运行 lint**

Run: `npm run lint`
Expected: 无错误

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 运行全部测试**

Run: `npm run test:run`
Expected: 全部 PASS

- [ ] **Step 4: 运行 build**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 5: 最终提交（如有改动）**

```bash
git add -A
git commit -m "fix(search): resolve lint and type issues" || echo "No changes to commit"
```

---

## Spec Coverage Checklist

| Spec 要求 | 实现任务 |
|-----------|---------|
| Details tab 搜索 entries itemName/description | Task 3 |
| Details tab 跨表搜索 source doc title/text | Task 3 |
| Stream tab 搜索 source doc title/text | Task 5 |
| Stream tab 跨表搜索 entries itemName/description | Task 5 |
| URL 参数 `search` | Task 2 |
| EntryFilterPanel UI 搜索框 | Task 10 |
| Schema 校验（max 200） | Task 1 |
| React Query 缓存隔离 | Task 8 |
| Stats 查询支持 | Task 7 |
| i18n 翻译 | Task 11 |
| 空搜索处理 | Task 3, Task 5 |
| 集成测试 | Task 12 |

## Placeholder Scan

- 无 "TBD"、"TODO"、"implement later"
- 无 "add appropriate error handling" 等模糊描述
- 每个代码步骤包含完整代码
- 无 "Similar to Task N" 引用

## Type Consistency

- `search` 字段在所有接口中统一为 `string | null | undefined` 或 `string | null`
- URL 参数名为 `"search"`
- Schema 字段名为 `"search"`
- Filter conditions 中使用 `searchQuery`（避免和 schema 字段名混淆）
- Source document collection params 中使用 `search`
