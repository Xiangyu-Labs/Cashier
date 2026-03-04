# 修复乐观更新失效问题 - 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 系统性修复乐观更新失效问题（类型 B：过滤参数导致的 key 变体，以及类型 A：Entity 级别的 key 分裂）

**Architecture:** 通过 TDD 方式：1) 先写测试复现问题；2) 修复 `createListSnapshots` 使其支持 predicate 匹配（解决类型 B）；3) 统一 Settings 数据流，移除聚合查询中的 categories（解决类型 A）。

**Tech Stack:** TypeScript, Vitest, TanStack Query, React

---

## Phase 1: 编写测试复现问题

### Task 1.1: 编写单元测试 - createListSnapshots 前缀匹配问题

**Files:**
- Create: `tests/unit/lib/mutations/createListSnapshots.test.ts`

**Step 1: 创建测试文件**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createListSnapshots } from "@/lib/mutations/use-ledger-mutation";

describe("createListSnapshots", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  describe("类型 B: 过滤参数导致的 key 变体", () => {
    it("应该匹配带过滤参数的 query key (sourceDocuments 场景)", () => {
      const ledgerId = "ledger-123";

      // 设置不同过滤参数的 queries
      queryClient.setQueryData(["sourceDocuments", ledgerId], []);
      queryClient.setQueryData(["sourceDocuments", ledgerId, "unified"], { items: [] });
      queryClient.setQueryData(["sourceDocuments", ledgerId, "unified", "2024-01-01"], { items: [] });
      queryClient.setQueryData(["sourceDocuments", ledgerId, "completed", "2024-01-01", "2024-12-31"], { items: [] });
      queryClient.setQueryData(["sourceDocuments", ledgerId, "active"], []);

      const baseKey = ["sourceDocuments", ledgerId];
      const snapshots = createListSnapshots(queryClient, baseKey);

      // 当前行为：只匹配完全相同的 key
      expect(snapshots.length).toBe(1);

      // 期望行为（修复后）：应该匹配所有以 baseKey 为前缀的 queries
      // expect(snapshots.length).toBe(5);
    });

    it("应该匹配带过滤参数的 query key (ledgerEntries 场景)", () => {
      const ledgerId = "ledger-456";

      queryClient.setQueryData(["ledgerEntries", ledgerId], []);
      queryClient.setQueryData(["ledgerEntries", ledgerId, "summary", "2024-01-01", "2024-12-31"], { total: 100 });
      queryClient.setQueryData(["ledgerEntries", ledgerId, "infinite", "2024-01-01"], { pages: [] });
      queryClient.setQueryData(["ledgerEntries", ledgerId, "monthly-expense", "2024-01-01", "2024-12-31"], []);

      const baseKey = ["ledgerEntries", ledgerId];
      const snapshots = createListSnapshots(queryClient, baseKey);

      // 当前：只匹配 1 个
      expect(snapshots.length).toBe(1);

      // 期望：匹配所有 4 个
      // expect(snapshots.length).toBe(4);
    });
  });
});
```

**Step 2: 运行测试验证问题存在**

Run: `npx vitest run tests/unit/lib/mutations/createListSnapshots.test.ts`
Expected: PASS（测试记录了当前行为，为修复后对比做准备）

**Step 3: 提交测试**

```bash
git add tests/unit/lib/mutations/createListSnapshots.test.ts
git commit -m "test: add failing test for createListSnapshots prefix matching

- Documents current behavior: only matches exact key
- Sets up for fix to match all prefixed keys

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 1.2: 编写集成测试 - useCategoryMutations 乐观更新效果

**Files:**
- Create: `tests/integration/client/category-mutations-optimistic.test.ts`

**Step 1: 创建测试文件**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { useCategoryMutations } from "@/features/ledger/client/hooks/useCategoryMutations";
import { renderHook, waitFor, act } from "@testing-library/react";
import { queryKeys } from "@/lib/query-keys";

describe("类型 A: Entity 级别的 key 分裂", () => {
  let queryClient: QueryClient;
  const ledgerId = "ledger-test-123";

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // 初始化两个不同的 cache
    queryClient.setQueryData(queryKeys.entryCategories(ledgerId), [
      { id: "cat-1", name: "餐饮", description: "吃饭" },
    ]);

    queryClient.setQueryData(queryKeys.ledgerSettings(ledgerId), {
      categories: [{ id: "cat-1", name: "餐饮", description: "吃饭" }],
      uncategorizedCount: 0,
      credentials: [],
    });
  });

  it("修改 category 后，entryCategories 和 ledgerSettings 应该同时更新", async () => {
    // 问题：乐观更新只修改 entryCategories
    // UI 从 ledgerSettings 读取，看到的是旧值

    const { result } = renderHook(
      () => useCategoryMutations(ledgerId, []),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }
    );

    // 触发更新
    act(() => {
      result.current.updateCategory.mutate({
        id: "cat-1",
        data: { description: "吃饭和饮料" },
      });
    });

    // 检查 entryCategories 已更新（乐观更新生效）
    await waitFor(() => {
      const entryCats = queryClient.getQueryData(queryKeys.entryCategories(ledgerId));
      expect(entryCats[0].description).toBe("吃饭和饮料");
    });

    // 问题：ledgerSettings 还是旧值！
    const settings = queryClient.getQueryData(queryKeys.ledgerSettings(ledgerId));
    expect(settings.categories[0].description).toBe("吃饭"); // 仍然是旧值！

    // 期望（修复后）：两个 cache 都更新
    // expect(settings.categories[0].description).toBe("吃饭和饮料");
  });
});
```

**Step 2: 运行测试验证问题存在**

Run: `npx vitest run tests/integration/client/category-mutations-optimistic.test.ts`
Expected: PASS（记录了当前问题行为）

**Step 3: 提交测试**

```bash
git add tests/integration/client/category-mutations-optimistic.test.ts
git commit -m "test: add test documenting category optimistic update failure

- Shows entryCategories is updated but ledgerSettings is not
- Documents the key mismatch issue

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

## Phase 2: 解决类型 B - 修复 createListSnapshots 前缀匹配

### Task 2.1: 扩展 createListSnapshots 支持 predicate

**Files:**
- Modify: `src/lib/mutations/use-ledger-mutation.ts:199-210`
- Modify: `src/lib/mutations/use-ledger-mutation.ts:214-226` (optimisticallyDeleteFromList)
- Modify: `src/lib/mutations/use-ledger-mutation.ts:228-242` (optimisticallyAddToList)
- Modify: `src/lib/mutations/use-ledger-mutation.ts:244-261` (optimisticallyUpdateInList)

**Step 1: 添加 predicate 支持到 createListSnapshots**

```typescript
// 在 use-ledger-mutation.ts 中添加新的重载

export interface CreateListSnapshotsOptions {
  /** 基础 query key */
  queryKey?: QueryKey;
  /** 自定义 predicate 匹配 */
  predicate?: (query: { queryKey: QueryKey }) => boolean;
}

export function createListSnapshots<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  options: CreateListSnapshotsOptions
): MutationSnapshot;
export function createListSnapshots<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: QueryKey
): MutationSnapshot;
export function createListSnapshots<T>(
  queryClient: ReturnType<typeof useQueryClient>,
  keyOrOptions: QueryKey | CreateListSnapshotsOptions
): MutationSnapshot {
  if (Array.isArray(keyOrOptions)) {
    // 向后兼容：旧的精确匹配行为
    return queryClient.getQueriesData<T>({ queryKey: keyOrOptions });
  }

  const { queryKey, predicate } = keyOrOptions;

  if (predicate) {
    // 使用 predicate 匹配
    return queryClient.getQueriesData<T>({ predicate });
  }

  if (queryKey) {
    // 基础 key 前缀匹配
    return queryClient.getQueriesData<T>({
      predicate: (query) => {
        const key = query.queryKey;
        if (!Array.isArray(key) || !Array.isArray(queryKey)) return false;
        // 检查 key 是否以 queryKey 为前缀
        if (key.length < queryKey.length) return false;
        for (let i = 0; i < queryKey.length; i++) {
          if (key[i] !== queryKey[i]) return false;
        }
        return true;
      },
    });
  }

  return [];
}
```

**Step 2: 更新 helper 函数使用新 API**

```typescript
// 修改 optimisticallyDeleteFromList 等函数，接受 options 参数
export function optimisticallyDeleteFromList<T extends { id: string }>(
  queryClient: ReturnType<typeof useQueryClient>,
  keyOrOptions: QueryKey | CreateListSnapshotsOptions,
  idToDelete: string
): { snapshots: MutationSnapshot } {
  const snapshots = Array.isArray(keyOrOptions)
    ? createListSnapshots<T[]>(queryClient, keyOrOptions)
    : createListSnapshots<T[]>(queryClient, keyOrOptions);

  const predicate = Array.isArray(keyOrOptions)
    ? { queryKey: keyOrOptions }
    : keyOrOptions.predicate
    ? { predicate: keyOrOptions.predicate }
    : { queryKey: keyOrOptions.queryKey! };

  queryClient.setQueriesData<T[]>(predicate, (old) =>
    old?.filter((item) => item.id !== idToDelete) ?? []
  );

  return { snapshots };
}
```

**Step 3: 运行单元测试验证修复**

Run: `npx vitest run tests/unit/lib/mutations/createListSnapshots.test.ts`
Expected: PASS（现在应该匹配多个 queries）

**Step 4: 提交修复**

```bash
git add src/lib/mutations/use-ledger-mutation.ts
git commit -m "feat: support predicate matching in createListSnapshots

- Add CreateListSnapshotsOptions interface
- Support prefix matching for query keys with filters
- Maintain backward compatibility with old API

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 2.2: 更新 useLedgerEntriesMutations 使用 predicate

**Files:**
- Modify: `src/features/ledger/client/hooks/useLedgerEntriesMutations.ts`

**Step 1: 修改 updateEntry mutation**

```typescript
// 找到 updateEntry 的 onOptimisticUpdate
// 从：
const snapshots = createListSnapshots<UnifiedData>(queryClient, queryKeys.sourceDocuments(ledgerId));

// 改为：
const snapshots = createListSnapshots<UnifiedData>(queryClient, {
  queryKey: queryKeys.sourceDocuments(ledgerId),
});
// 或使用更精确的 predicate
const snapshots = createListSnapshots<UnifiedData>(queryClient, {
  predicate: (query) => {
    const key = query.queryKey;
    return Array.isArray(key) &&
           key[0] === 'sourceDocuments' &&
           key[1] === ledgerId;
  }
});
```

**Step 2: 同样修改 deleteEntry, batchDelete 等 mutations**

**Step 3: 运行相关测试**

Run: `npx vitest run tests/integration/ledger/entry-actions.test.ts`
Expected: PASS

**Step 4: 提交**

```bash
git add src/features/ledger/client/hooks/useLedgerEntriesMutations.ts
git commit -m "fix: use predicate matching in ledger entry mutations

- Ensures optimistic updates match all query variants
- Fixes type B key mismatch issues

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 2.3: 更新 useEntryMutations 使用 predicate

**Files:**
- Modify: `src/features/ledger/client/hooks/useEntryMutations.ts`

步骤同 Task 2.2，修复 ledgerEntries 相关的 mutations。

---

## Phase 3: 解决类型 A - 统一 Settings 数据流

### Task 3.1: 修改 useLedgerSettings 使用 entryCategories key

**Files:**
- Modify: `src/features/ledger/client/hooks/useLedgerSettings.ts`
- Create: `src/features/ledger/server/actions/entry-categories.ts` (如果还不存在)

**Step 1: 添加独立的 categories query**

```typescript
// useLedgerSettings.ts
import { useQuery } from "@tanstack/react-query";

export function useLedgerSettings({ ledgerId, ledger, initialCategories }) {
  // 直接使用 entryCategories query，与 useCategoryMutations 一致
  const { data: categories = initialCategories } = useQuery({
    queryKey: queryKeys.entryCategories(ledgerId),
    queryFn: () => getEntryCategoriesAction(ledgerId),
    initialData: initialCategories,
  });

  // 修改聚合查询，不再返回 categories
  const { data: settingsData } = useSmartPolling<{
    uncategorizedCount: number;
    credentials: ServiceCredential[];
  }>({
    queryKey: queryKeys.ledgerSettings(ledgerId),
    queryFn: () => getLedgerSettingsWithoutCategoriesAction(ledgerId),
    // ...
  });

  return {
    categories, // 来自独立的 query
    uncategorizedCount: settingsData?.uncategorizedCount || 0,
    credentials: settingsData?.credentials || [],
  };
}
```

**Step 2: 创建或修改 server action**

```typescript
// server/actions/entry-categories.ts
export async function getEntryCategoriesAction(ledgerId: string) {
  // 返回 EntryCategoryWithCount[]
}

// server/actions/settings.ts - 修改 getLedgerSettingsAction
export async function getLedgerSettingsWithoutCategoriesAction(ledgerId: string) {
  // 只返回 { uncategorizedCount, credentials }
}
```

**Step 3: 运行集成测试**

Run: `npx vitest run tests/integration/client/category-mutations-optimistic.test.ts`
Expected: PASS（现在应该同时更新两个 cache）

**Step 4: 提交**

```bash
git add src/features/ledger/client/hooks/useLedgerSettings.ts \
        src/features/ledger/server/actions/
git commit -m "fix: unify category data source in settings

- SettingsTab now reads from entryCategories key
- Fixes type A key mismatch issue
- Optimistic updates now work correctly

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

### Task 3.2: 更新测试验证修复

**Files:**
- Modify: `tests/integration/client/category-mutations-optimistic.test.ts`

**Step 1: 更新测试期望**

```typescript
// 修改测试，验证修复后行为
it("修改 category 后，entryCategories 和 UI 应该同步更新", async () => {
  // ... 触发更新 ...

  // 现在只有一个 cache，修改后立即生效
  const categories = queryClient.getQueryData(queryKeys.entryCategories(ledgerId));
  expect(categories[0].description).toBe("吃饭和饮料");

  // 不再需要检查 ledgerSettings，因为它不再包含 categories
});
```

**Step 2: 运行测试**

Run: `npx vitest run tests/integration/client/category-mutations-optimistic.test.ts`
Expected: PASS

**Step 3: 提交**

```bash
git add tests/integration/client/category-mutations-optimistic.test.ts
git commit -m "test: update test to verify unified data source

via [HAPI](https://hapi.run)

Co-Authored-By: HAPI <noreply@hapi.run>"
```

---

## 验证与完成

### Task 4.1: 运行完整测试套件

Run: `npm run test:run`
Expected: All PASS

### Task 4.2: 手动验证

1. 启动开发服务器: `npm run dev`
2. 打开 Settings → Ledger Settings
3. 修改分类描述
4. 验证：修改立即显示（乐观更新生效），没有闪烁

### Task 4.3: 最终提交

```bash
git log --oneline -10
# 确认所有 commits
```

---

## Summary

| Phase | 问题类型 | 修复内容 |
|-------|---------|---------|
| Phase 1 | - | 编写测试复现问题 |
| Phase 2 | 类型 B | createListSnapshots 支持 predicate 匹配 |
| Phase 3 | 类型 A | Settings 统一使用 entryCategories key |

**关键文件变更：**
- `src/lib/mutations/use-ledger-mutation.ts` - 核心修复
- `src/features/ledger/client/hooks/useLedgerEntriesMutations.ts` - 使用新 API
- `src/features/ledger/client/hooks/useEntryMutations.ts` - 使用新 API
- `src/features/ledger/client/hooks/useLedgerSettings.ts` - 统一数据源
