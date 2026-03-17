# 修复预加载机制与竞态条件 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复Cashier项目中预加载机制的关键bug和竞态条件，确保数据一致性和流畅的用户体验

**Architecture:** 通过修复query key匹配逻辑、标准化staleTime配置、优化mutation与polling协调，消除数据不一致和UI闪烁问题

**Tech Stack:** Next.js 16, React Query (TanStack Query), TypeScript, Zustand

---

## 背景

经过10个agent的深度代码审查，发现以下关键问题：

| 优先级 | 问题 | 影响 |
|--------|------|------|
| **P0** | 日历缓存失效 | 日历热力图数据在mutation后永不更新 |
| **P0** | 日期范围查询失效 | 编辑条目后日期筛选列表显示旧数据 |
| **P1** | 乐观更新与轮询竞态 | 快速操作可能导致数据闪烁或重复 |
| **P1** | 设置页面加载闪烁 | CSR模式导致不必要的加载状态 |
| **P2** | staleTime配置不一致 | 维护困难，潜在hydration问题 |

---

## 文件结构

| 文件 | 责任 | 变更类型 |
|------|------|----------|
| `src/lib/query-keys.ts` | 集中管理query key和缓存失效逻辑 | 修改 `invalidateLedgerCache` 函数 |
| `src/lib/constants.ts` | 定义staleTime常量 | 添加 `QUERY` 常量组 |
| `src/lib/mutations/use-ledger-mutation.ts` | mutation基础hook | 添加mutation状态追踪 |
| `src/lib/store/mutation-state.ts` | 全局mutation状态store | 新建 |
| `src/hooks/use-smart-polling.ts` | 智能轮询hook | 添加暂停机制 |
| `src/features/ledger/client/hooks/use-ledger-entries-mutations.ts` | 条目mutation | 改用predicate匹配 |
| `src/features/source-document/client/hooks/use-batch-source-document-actions.ts` | 批量操作mutation | 改用predicate匹配 |
| `src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx` | 设置页面 | 改为SSR模式 |
| `src/components/providers.tsx` | QueryClient配置 | 使用常量替代硬编码 |
| `tests/unit/lib/query-keys.test.ts` | query key测试 | 添加测试用例 |

---

## Chunk 1: 修复日历缓存失效 (P0)

### Task 1.1: 添加日历缓存失效测试

**Files:**
- Create: `tests/unit/lib/query-keys-calendar.test.ts`

- [ ] **Step 1: 编写测试文件**

```typescript
import { describe, it, expect } from "vitest";
import { queryKeys, invalidateLedgerCache } from "@/lib/query-keys";

describe("invalidateLedgerCache - calendar keys", () => {
    const ledgerId = "ledger-123";
    const predicate = invalidateLedgerCache(ledgerId);

    it("应该匹配calendarHeatmap查询", () => {
        const key = queryKeys.calendarHeatmap(ledgerId, "month", "2024-03-01", undefined);
        expect(predicate({ queryKey: key })).toBe(true);
    });

    it("应该匹配calendarHeatmapForRange查询", () => {
        const key = queryKeys.calendarHeatmapForRange(ledgerId, "2024-01-01", "2024-12-31", undefined);
        expect(predicate({ queryKey: key })).toBe(true);
    });

    it("应该匹配calendarDayDetail查询", () => {
        const key = queryKeys.calendarDayDetail(ledgerId, "2024-03-15", undefined);
        expect(predicate({ queryKey: key })).toBe(true);
    });

    it("不应该匹配其他ledger的calendar查询", () => {
        const key = queryKeys.calendarHeatmap("other-ledger", "month", "2024-03-01", undefined);
        expect(predicate({ queryKey: key })).toBe(false);
    });

    it("应该继续匹配标准ledger查询", () => {
        expect(predicate({ queryKey: queryKeys.ledger(ledgerId) })).toBe(true);
        expect(predicate({ queryKey: queryKeys.ledgerEntries(ledgerId, "all") })).toBe(true);
        expect(predicate({ queryKey: queryKeys.sourceDocuments(ledgerId, "all") })).toBe(true);
        expect(predicate({ queryKey: queryKeys.entryCategories(ledgerId) })).toBe(true);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:unit -- tests/unit/lib/query-keys-calendar.test.ts`

Expected: FAIL - calendar key tests fail

- [ ] **Step 3: 提交测试文件**

```bash
git add tests/unit/lib/query-keys-calendar.test.ts
git commit -m "test: add failing tests for calendar cache invalidation"
```

### Task 1.2: 修复invalidateLedgerCache函数

**Files:**
- Modify: `src/lib/query-keys.ts:85-92`

- [ ] **Step 1: 修改invalidateLedgerCache函数**

```typescript
/**
 * Helper to create a predicate for invalidating all queries related to a ledger.
 * This ensures all ledger-related data is refreshed after mutations.
 *
 * Usage:
 *   queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) })
 */
export function invalidateLedgerCache(ledgerId: string) {
    return (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey;
        // Check if ledgerId exists anywhere in the query key array
        // This handles both standard keys (position 0 or 1) and calendar keys (position 2)
        return Array.isArray(key) && key.includes(ledgerId);
    };
}
```

- [ ] **Step 2: 运行测试确认通过**

Run: `npm run test:unit -- tests/unit/lib/query-keys-calendar.test.ts`

Expected: PASS

- [ ] **Step 3: 运行所有query-keys测试确保不破坏现有功能**

Run: `npm run test:unit -- tests/unit/lib/query-keys.test.ts`

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/lib/query-keys.ts
git commit -m "fix: fix calendar cache invalidation by using key.includes"
```

---

## Chunk 2: 修复日期范围查询失效 (P0)

### Task 2.1: 添加source document predicate helper

**Files:**
- Modify: `src/lib/query-keys.ts` (添加新函数)

- [ ] **Step 1: 在query-keys.ts末尾添加matchSourceDocuments函数**

```typescript
/**
 * Helper to create a predicate for matching all source document queries for a ledger.
 * This matches queries regardless of date range filters.
 *
 * Usage:
 *   queryClient.setQueriesData({ predicate: matchSourceDocuments(ledgerId) }, updater)
 *   queryClient.invalidateQueries({ predicate: matchSourceDocuments(ledgerId) })
 */
export function matchSourceDocuments(ledgerId: string) {
    return (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey;
        return Array.isArray(key) &&
               key[0] === 'sourceDocuments' &&
               key[1] === ledgerId;
    };
}

/**
 * Helper to create a predicate for matching all ledger entries queries for a ledger.
 * This matches queries regardless of filters.
 */
export function matchLedgerEntries(ledgerId: string) {
    return (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey;
        return Array.isArray(key) &&
               key[0] === 'ledgerEntries' &&
               key[1] === ledgerId;
    };
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/query-keys.ts
git commit -m "feat: add predicate helpers for source documents and ledger entries"
```

### Task 2.2: 更新use-ledger-entries-mutations使用predicate

**Files:**
- Modify: `src/features/ledger/client/hooks/use-ledger-entries-mutations.ts`

- [ ] **Step 1: 更新import语句**

```typescript
import { queryKeys, matchSourceDocuments, matchLedgerEntries } from "@/lib/query-keys";
```

- [ ] **Step 2: 修改updateEntry optimistic update**

找到大约第27-50行的代码，修改为：

```typescript
const updateEntry = useLedgerMutation<LedgerEntry, { ledgerEntryId: string; data: Partial<Omit<LedgerEntry, "id">> }>(
    ledgerId,
    {
        mutationFn: async ({ ledgerEntryId, data }) => {
            return await updateLedgerEntryAction(ledgerId, ledgerEntryId, data);
        },
        successMessage: tCommon("saveSuccess"),
        errorMessage: tCommon("error"),
        onOptimisticUpdate: (queryClient, { ledgerEntryId, data }) => {
            // Use predicate to match all source document queries (including date-ranged ones)
            const snapshots = queryClient.getQueriesData<SourceDocumentsQueryData>({
                predicate: matchSourceDocuments(ledgerId),
            });

            queryClient.setQueriesData<SourceDocumentsQueryData>(
                { predicate: matchSourceDocuments(ledgerId) },
                (old) => {
                    if (!old) return old;
                    return old.map((doc) => ({
                        ...doc,
                        ledgerEntries: doc.ledgerEntries?.map((entry) =>
                            entry.id === ledgerEntryId ? { ...entry, ...data } : entry
                        ),
                    }));
                }
            );

            return { snapshots };
        },
    }
);
```

- [ ] **Step 3: 修改其他mutation使用predicate模式**

同样修改 `deleteEntry`, `batchUpdateEntries`, `batchDeleteEntries` 中的 `setQueriesData` 调用，使用 `{ predicate: matchSourceDocuments(ledgerId) }` 替代 `{ queryKey: listKey }`。

- [ ] **Step 4: 提交**

```bash
git add src/features/ledger/client/hooks/use-ledger-entries-mutations.ts
git commit -m "fix: use predicate matching for source document optimistic updates"
```

### Task 2.3: 更新use-batch-source-document-actions使用predicate

**Files:**
- Modify: `src/features/source-document/client/hooks/use-batch-source-document-actions.ts`

- [ ] **Step 1: 更新import和mutation中的setQueriesData调用**

```typescript
import { queryKeys, matchSourceDocuments } from "@/lib/query-keys";
```

将所有使用 `listKey` 的 `setQueriesData` 改为使用 `{ predicate: matchSourceDocuments(ledgerId) }`。

- [ ] **Step 2: 提交**

```bash
git add src/features/source-document/client/hooks/use-batch-source-document-actions.ts
git commit -m "fix: use predicate matching for batch source document actions"
```

---

## Chunk 3: 修复乐观更新与轮询竞态 (P1)

### Task 3.1: 创建全局mutation状态store

**Files:**
- Create: `src/lib/store/mutation-state.ts`

- [ ] **Step 1: 创建mutation状态store**

```typescript
import { create } from "zustand";

interface MutationState {
    /** 当前活跃的ledger-scoped mutation计数 */
    activeLedgerMutationCount: number;
    /** 增加mutation计数 */
    incrementLedgerMutation: () => void;
    /** 减少mutation计数 */
    decrementLedgerMutation: () => void;
    /** 是否有活跃的ledger mutation */
    hasActiveLedgerMutation: () => boolean;
}

/**
 * 全局mutation状态管理
 *
 * 用于协调多个mutation和智能轮询之间的竞争条件。
 * 当mutation正在进行时，智能轮询应该暂停以避免覆盖乐观更新。
 */
export const useMutationStore = create<MutationState>((set, get) => ({
    activeLedgerMutationCount: 0,

    incrementLedgerMutation: () =>
        set((state) => ({
            activeLedgerMutationCount: state.activeLedgerMutationCount + 1
        })),

    decrementLedgerMutation: () =>
        set((state) => ({
            activeLedgerMutationCount: Math.max(0, state.activeLedgerMutationCount - 1)
        })),

    hasActiveLedgerMutation: () => get().activeLedgerMutationCount > 0,
}));
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/store/mutation-state.ts
git commit -m "feat: add global mutation state store for coordinating polling"
```

### Task 3.2: 在useLedgerMutation中集成mutation状态

**Files:**
- Modify: `src/lib/mutations/use-ledger-mutation.ts`

- [ ] **Step 1: 添加import**

```typescript
import { useMutationStore } from "@/lib/store/mutation-state";
```

- [ ] **Step 2: 在useLedgerMutation函数中添加状态管理**

```typescript
export function useLedgerMutation<TData = unknown, TVariables = void, TContext = unknown>(
    ledgerId: string | undefined,
    options: UseLedgerMutationOptions<TData, TVariables, TContext>
) {
    const queryClient = useQueryClient();
    const { incrementLedgerMutation, decrementLedgerMutation } = useMutationStore();

    const {
        mutationFn,
        onOptimisticUpdate,
        onRollback,
        successMessage,
        errorMessage,
        skipInvalidation = false,
        customInvalidation,
        onSuccessExtra,
        onSettledExtra,
        ...restOptions
    } = options;
```

- [ ] **Step 3: 在onMutate中增加计数**

```typescript
onMutate: async (variables) => {
    // Increment mutation counter to pause polling
    incrementLedgerMutation();

    // Cancel outgoing queries to prevent race conditions
    if (ledgerId) {
        await queryClient.cancelQueries({ predicate: invalidateLedgerCache(ledgerId) });
    }

    // Perform optimistic update if provided
    if (onOptimisticUpdate) {
        return await onOptimisticUpdate(queryClient, variables);
    }
    return undefined as unknown as TContext;
},
```

- [ ] **Step 4: 在onSettled中减少计数**

```typescript
onSettled: async (data, error, variables) => {
    try {
        // Only invalidate queries if the mutation doesn't return data
        // or if skipInvalidation is false. When mutation returns data,
        // onSuccessExtra should handle cache updates directly.
        if (!skipInvalidation && !error && data === undefined) {
            if (customInvalidation) {
                customInvalidation(queryClient);
            } else if (ledgerId) {
                await queryClient.invalidateQueries({ predicate: invalidateLedgerCache(ledgerId) });
            }
        }

        // Run additional settled callback
        if (onSettledExtra) {
            onSettledExtra(queryClient, variables, data, error);
        }
    } finally {
        // Always decrement, even if there was an error
        decrementLedgerMutation();
    }
},
```

- [ ] **Step 5: 提交**

```bash
git add src/lib/mutations/use-ledger-mutation.ts
git commit -m "feat: integrate mutation state tracking into useLedgerMutation"
```

### Task 3.3: 在useSmartPolling中添加暂停机制

**Files:**
- Modify: `src/hooks/use-smart-polling.ts`

- [ ] **Step 1: 添加import**

```typescript
import { useMutationStore } from "@/lib/store/mutation-state";
```

- [ ] **Step 2: 在useSmartPolling中读取mutation状态**

```typescript
export function useSmartPolling<TData = unknown, TError = unknown>(
    options: SmartPollingOptions<TData, TError>
) {
    const {
        isActive,
        interval = 5000,
        cooldownInterval = 10000,
        idleInterval,
        ...queryOptions
    } = options;

    const hasActiveLedgerMutation = useMutationStore((state) => state.hasActiveLedgerMutation);

    const unchangedCountRef = useRef(0);
    const lastDataRef = useRef<string | undefined>(undefined);
```

- [ ] **Step 3: 在refetchInterval中检查mutation状态**

```typescript
    return useQuery<TData, TError>({
        ...queryOptions,
        refetchInterval: (query) => {
            // PAUSE polling when any ledger mutation is active
            // This prevents polling from overwriting optimistic updates
            if (hasActiveLedgerMutation()) {
                return false;
            }

            const data = query.state.data;

            // Check if polling should be active based on data content
            if (!isActive(data)) {
                return idleInterval ?? false;
            }

            // Check if data changed since last poll
            checkDataChanged(data);

            // Use cooldown interval if data unchanged for 2+ polls
            if (unchangedCountRef.current >= 2) {
                return cooldownInterval;
            }

            return interval;
        },
    });
}
```

- [ ] **Step 4: 提交**

```bash
git add src/hooks/use-smart-polling.ts
git commit -m "feat: pause smart polling during ledger mutations"
```

### Task 3.4: 重新启用batchRetry的乐观更新

**Files:**
- Modify: `src/features/task-queue/client/hooks/use-task-queue-mutations.ts`

- [ ] **Step 1: 修改batchRetry mutation添加乐观更新**

找到 `batchRetry` mutation（约90-98行），移除注释并添加乐观更新：

```typescript
const batchRetry = useLedgerMutation<void, string[]>(ledgerId, {
    mutationFn: (ids) => batchRetrySourceDocumentsAction(ledgerId, ids),
    successMessage: tEntries("retrySubmitted"),
    errorMessage: tCommon("error"),
    // Optimistic update: mark items as queued immediately
    onOptimisticUpdate: (queryClient, ids) => {
        const snapshots = queryClient.getQueriesData<QueueItem[]>({
            queryKey: queryKeys.taskQueue(ledgerId),
        });

        queryClient.setQueriesData<QueueItem[]>(
            { queryKey: queryKeys.taskQueue(ledgerId) },
            (old) => {
                if (!old) return old;
                return old.map((item) =>
                    ids.includes(item.id) ? { ...item, status: "queued" as const } : item
                );
            }
        );

        return { snapshots };
    },
});
```

- [ ] **Step 2: 提交**

```bash
git add src/features/task-queue/client/hooks/use-task-queue-mutations.ts
git commit -m "feat: re-enable optimistic update for batchRetry with polling coordination"
```

---

## Chunk 4: 修复设置页面加载闪烁 (P1)

### Task 4.1: 将设置页面改为SSR模式

**Files:**
- Modify: `src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx`

- [ ] **Step 1: 完全重写设置页面为Server Component**

```typescript
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getLedgerAction } from "@/features/ledger/server/actions/get";
import { getEntryCategoriesAction } from "@/features/ledger/server/actions/categories";
import { SettingsPageClient } from "@/features/ledger/components/SettingsPageClient";
import { queryKeys } from "@/lib/query-keys";
import { LEDGER } from "@/lib/constants";

interface SettingsPageProps {
    params: Promise<{ id: string }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
    const { id: ledgerId } = await params;
    const queryClient = new QueryClient();

    const STALE_TIME = LEDGER.STALE_TIME_MS;

    // Prefetch ledger data
    const ledger = await queryClient.fetchQuery({
        queryKey: queryKeys.ledger(ledgerId),
        queryFn: () => getLedgerAction(ledgerId),
        staleTime: STALE_TIME,
    });

    // Prefetch categories
    const categories = await queryClient.fetchQuery({
        queryKey: queryKeys.entryCategories(ledgerId),
        queryFn: () => getEntryCategoriesAction(ledgerId),
        staleTime: STALE_TIME,
    });

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <SettingsPageClient
                ledger={ledger}
                initialCategories={categories}
                ledgerId={ledgerId}
            />
        </HydrationBoundary>
    );
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/[locale]/(protected)/ledger/[id]/settings/page.tsx
git commit -m "refactor: convert settings page to SSR with HydrationBoundary"
```

---

## Chunk 5: 修复staleTime不一致 (P2)

### Task 5.1: 添加QUERY常量

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: 在文件末尾添加QUERY常量**

```typescript
// Query cache configuration
export const QUERY = {
    /** 默认staleTime - 5分钟 */
    DEFAULT_STALE_TIME_MS: 5 * 60 * 1000,
    /** Ledger数据staleTime - 10分钟（较稳定） */
    LEDGER_STALE_TIME_MS: 10 * 60 * 1000,
    /** 源文档staleTime - 30秒（频繁变化） */
    SOURCE_DOC_STALE_TIME_MS: 30 * 1000,
    /** 货币汇率staleTime - 24小时（外部数据，变化慢） */
    CURRENCY_STALE_TIME_MS: 24 * 60 * 60 * 1000,
} as const;
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/constants.ts
git commit -m "feat: add QUERY constants for cache configuration"
```

### Task 5.2: 更新providers.tsx使用常量

**Files:**
- Modify: `src/components/providers.tsx`

- [ ] **Step 1: 更新import和staleTime配置**

```typescript
import { QUERY } from "@/lib/constants";

// ... in QueryClient constructor
defaultOptions: {
    queries: {
        staleTime: QUERY.DEFAULT_STALE_TIME_MS, // 5 minutes
        gcTime: 24 * 60 * 60 * 1000, // 24 hours
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: true,
        retry: (failureCount) => failureCount < 3,
    },
},
```

- [ ] **Step 2: 提交**

```bash
git add src/components/providers.tsx
git commit -m "refactor: use QUERY constants in providers"
```

### Task 5.3: 更新ledger page使用常量

**Files:**
- Modify: `src/app/[locale]/(protected)/ledger/[id]/page.tsx`

- [ ] **Step 1: 更新import和staleTime使用**

```typescript
import { LEDGER, QUERY } from "@/lib/constants";

// ... in component
const STALE_TIME = LEDGER.STALE_TIME_MS; // 10 minutes

// ... for source documents
staleTime: QUERY.SOURCE_DOC_STALE_TIME_MS, // 30 seconds
```

- [ ] **Step 2: 提交**

```bash
git add src/app/[locale]/(protected)/ledger/[id]/page.tsx
git commit -m "refactor: use constants for staleTime in ledger page"
```

---

## 验证步骤

### 完整测试运行

- [ ] **运行所有单元测试**

```bash
npm run test:unit
```

Expected: All tests pass

- [ ] **运行集成测试**

```bash
npm run test:integration
```

Expected: All tests pass

- [ ] **构建项目**

```bash
npm run build
```

Expected: Build succeeds without errors

### 功能验证

- [ ] **验证日历缓存失效**

1. 打开ledger页面，切换到日历视图
2. 记下某个日期的支出金额/颜色
3. 切换到列表视图，删除该日期的一条记录
4. 切回日历视图，确认该日期的颜色/金额已更新

- [ ] **验证日期范围查询失效**

1. 打开ledger页面，筛选某个月份的数据
2. 编辑该月份内的一条记录金额
3. 确认列表显示更新后的金额（无需刷新）

- [ ] **验证轮询暂停**

1. 上传一个收据让AI解析（进入processing状态）
2. 在解析过程中快速连续点击某条目的编辑并保存
3. 确认没有数据闪烁或覆盖现象

- [ ] **验证设置页面加载**

1. 从ledger页面导航到设置页面
2. 确认没有loading skeleton出现（或出现时间极短）
3. 直接刷新设置页面，确认能正常显示

---

## 总结

本次修复解决的核心问题：

| 问题 | 修复方式 |
|------|----------|
| 日历缓存失效 | `invalidateLedgerCache`改用`key.includes(ledgerId)` |
| 日期范围查询失效 | 使用predicate匹配替代精确key匹配 |
| 乐观更新竞态 | 全局mutation状态store + 轮询暂停机制 |
| 设置页面闪烁 | 改为SSR模式 |
| staleTime不一致 | 统一使用constants |

**预计工作量：** 4-6小时
**风险等级：** 中等（涉及核心mutation逻辑，需要充分测试）
