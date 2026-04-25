# 修复账目分录乐观更新 Query Key 匹配问题

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `use-entry-mutations.ts` 中的乐观更新，使其能够正确更新带有过滤参数的账目分录缓存

**Architecture:** 将 `setQueriesData` 从精确匹配改为前缀匹配，与项目中其他模块（如源文档模块）使用相同模式

**Tech Stack:** React Query, TypeScript

---

## 问题描述

在 `use-entry-mutations.ts` 中，乐观更新使用精确匹配的 Query Key，但数据获取使用的是带有过滤参数的 Query Key，导致乐观更新无法正确反映到 UI 上。

### Query Key 对比

| 用途 | Query Key 格式 | 示例 |
|------|---------------|------|
| 数据获取 | `['ledgerEntries', ledgerId, 'infinite', startDate, endDate]` | `['ledgerEntries', 'abc', 'infinite', '2024-01-01', '2024-01-31']` |
| Mutation (当前) | `['ledgerEntries', ledgerId]` | `['ledgerEntries', 'abc']` |

**问题**: `setQueriesData({ queryKey: ['ledgerEntries', ledgerId] }, ...)` 只匹配精确的基础 key，不匹配带过滤参数的 key。

### 参考实现

源文档模块已正确实现此模式：

```typescript
// src/features/source-document/client/hooks/use-batch-source-document-actions.ts
queryClient.setQueriesData<SourceDocumentWithEntries[]>(
    { predicate: matchSourceDocuments(ledgerId) },  // 使用 predicate 匹配
    (old) => ...
);
```

`matchSourceDocuments` 在 `query-keys.ts` 中定义：

```typescript
export function matchSourceDocuments(ledgerId: string) {
    return (query: { queryKey: readonly unknown[] }) => {
        const key = query.queryKey;
        return Array.isArray(key) &&
               key[0] === 'sourceDocuments' &&
               key[1] === ledgerId;
    };
}
```

---

## 文件结构

- **Modify:** `src/features/ledger/client/hooks/use-entry-mutations.ts` - 修复乐观更新的 Query Key 匹配逻辑

---

## Task 1: 修复 use-entry-mutations.ts 中的乐观更新

**Files:**
- Modify: `src/features/ledger/client/hooks/use-entry-mutations.ts:46-87`

- [ ] **Step 1: 查看当前代码**

读取文件 `src/features/ledger/client/hooks/use-entry-mutations.ts`，找到 `updateEntry` mutation 的 `onOptimisticUpdate` 函数。

重点关注第 46-87 行：

```typescript
onOptimisticUpdate: (queryClient, { ledgerEntryId, data }) => {
    const snapshots = createListSnapshots<InfiniteData>(queryClient, queryKeys.ledgerEntries(ledgerId));

    queryClient.setQueriesData<InfiniteData>(
        { queryKey: queryKeys.ledgerEntries(ledgerId) },  // ← 这里使用精确匹配
        (old) => { ... }
    );
    ...
}
```

- [ ] **Step 2: 修改为前缀匹配**

将两个 `setQueriesData` 调用从精确匹配改为 predicate 前缀匹配：

**当前代码（第 49-50 行）：**
```typescript
queryClient.setQueriesData<InfiniteData>(
    { queryKey: queryKeys.ledgerEntries(ledgerId) },
```

**改为：**
```typescript
queryClient.setQueriesData<InfiniteData>(
    { predicate: matchLedgerEntries(ledgerId) },
```

**当前代码（第 101-102 行，deleteEntry）：**
```typescript
queryClient.setQueriesData<InfiniteData>(
    { queryKey: queryKeys.ledgerEntries(ledgerId) },
```

**改为：**
```typescript
queryClient.setQueriesData<InfiniteData>(
    { predicate: matchLedgerEntries(ledgerId) },
```

- [ ] **Step 3: 添加导入**

在文件顶部导入 `matchLedgerEntries`：

**当前导入（第 1-4 行）：**
```typescript
import { useTranslations } from "next-intl";
import { queryKeys } from "@/lib/query-keys";
import {
    useLedgerMutation,
    createListSnapshots,
} from "@/lib/mutations/use-ledger-mutation";
```

**改为：**
```typescript
import { useTranslations } from "next-intl";
import { queryKeys, matchLedgerEntries } from "@/lib/query-keys";
import {
    useLedgerMutation,
    createListSnapshots,
} from "@/lib/mutations/use-ledger-mutation";
```

- [ ] **Step 4: 验证修改**

修改后的 `updateEntry` mutation 应该如下所示：

```typescript
onOptimisticUpdate: (queryClient, { ledgerEntryId, data }) => {
    const snapshots = createListSnapshots<InfiniteData>(queryClient, queryKeys.ledgerEntries(ledgerId));

    queryClient.setQueriesData<InfiniteData>(
        { predicate: matchLedgerEntries(ledgerId) },  // ← 改为前缀匹配
        (old) => {
            if (!old?.pages) return old;
            return {
                ...old,
                pages: old.pages.map(page => ({
                    ...page,
                    items: page.items?.map(e =>
                        e.id === ledgerEntryId
                            ? {
                                ...e,
                                ...data,
                                amount: data.amount !== undefined ? String(data.amount) : e.amount,
                                category: data.categoryId
                                    ? categories.find(c => c.id === data.categoryId) || e.category
                                    : e.category,
                            } satisfies LedgerEntry
                            : e
                    )
                }))
            };
        }
    );

    // Also update selected entry immediately for modal
    if (selectedLedgerEntry && selectedLedgerEntry.id === ledgerEntryId) {
        setSelectedLedgerEntry({
            ...selectedLedgerEntry,
            ...data,
            amount: data.amount !== undefined ? String(data.amount) : selectedLedgerEntry.amount,
            category: data.categoryId
                ? categories.find(c => c.id === data.categoryId) || selectedLedgerEntry.category
                : selectedLedgerEntry.category
        } satisfies LedgerEntry);
    }

    return { snapshots };
},
```

- [ ] **Step 5: 运行测试**

```bash
npm run test:run
```

Expected: All tests pass

- [ ] **Step 6: 提交更改**

```bash
git add src/features/ledger/client/hooks/use-entry-mutations.ts
git commit -m "fix: use predicate matching for ledger entries optimistic updates

Change setQueriesData from exact key matching to prefix matching
using matchLedgerEntries(ledgerId) predicate. This ensures optimistic
updates are applied to all ledger entries queries regardless of
date filters or other query parameters.

Fixes inconsistency where data fetching uses ['ledgerEntries', ledgerId, 'infinite', ...]
but mutation only matched ['ledgerEntries', ledgerId]."
```

---

## Acceptance Criteria

- [ ] `use-entry-mutations.ts` 使用 `matchLedgerEntries(ledgerId)` predicate 进行缓存更新
- [ ] 导入语句中包含 `matchLedgerEntries`
- [ ] 所有测试通过
- [ ] 代码风格与项目中其他模块一致（如源文档模块）

---

## References

- 源文档模块的参考实现: `src/features/source-document/client/hooks/use-batch-source-document-actions.ts`
- `matchLedgerEntries` 定义: `src/lib/query-keys.ts` (已存在)
- 当前问题文件: `src/features/ledger/client/hooks/use-entry-mutations.ts`
