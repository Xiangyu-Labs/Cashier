# Ledger 搜索功能设计文档

## 背景

Cashier 的 ledger 页面（stream / details 两个 tab）目前支持日期、分类、货币、金额筛选，但缺少文本搜索。用户无法通过关键词（如"超市"、"咖啡"）快速定位历史记录。

## 目标

在 ledger 页面的两个 tab（stream 和 details）中提供统一的文本搜索功能，搜索词能同时命中：
- **Ledger entries**：`itemName`、`description`
- **Source documents**：`title`、`text`

## 非目标

- Admin 后台搜索（本次不涉及）
- 全文搜索引擎（FTS5）或外部搜索服务
- 搜索关键词高亮
- 多关键词 AND/OR 语法
- 搜索结果排序自定义

## 设计方案

### 架构概述

采用**跨表 LIKE 搜索**，复用现有 filter 管道：
- UI：`EntryFilterPanel` Popover 内增加搜索输入框
- 状态：URL query param `search` 统一管理
- Details tab：搜 entries，同时检查关联 source doc 的 title/text
- Stream tab：搜 source docs，同时检查关联 entries 的 itemName/description

### 数据流

```
用户输入 → EntryFilterPanel temp state → Apply
  → onFiltersChange → usePeriodFilter.handleFiltersChange
  → updateLedgerSearchParams({ search }) → URL 更新
  → React Query 检测到 key 变化 → refetch
  → getLedgerEntriesAction({ ..., search }) / getSourceDocumentCollectionAction({ ..., search })
  → buildLedgerEntryFilterConditions / buildSourceDocumentFilterConditions
    → 子查询实现跨表 LIKE 匹配
  → Drizzle → SQLite → 返回结果
```

### 查询层设计

#### Details tab（listLedgerEntryPage）

使用**子查询**实现跨表搜索，避免将 relational query 改为显式 query builder：

```typescript
if (filters.searchQuery?.trim()) {
  const q = `%${filters.searchQuery.trim()}%`;
  const matchingDocIds = db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(and(
      eq(sourceDocuments.ledgerId, ledgerId),
      or(like(sourceDocuments.title, q), like(sourceDocuments.text, q))
    ));

  conditions.push(
    or(
      like(ledgerEntries.itemName, q),
      like(ledgerEntries.description, q),
      inArray(ledgerEntries.sourceDocumentId, matchingDocIds)
    )
  );
}
```

优势：保持 relational query 不变（`with: { sourceDocument: true }`），mapper 无需改动。

#### Stream tab（listSourceDocumentCollectionQuery）

使用 **EXISTS 子查询** 实现跨表搜索：

```typescript
if (params.search?.trim()) {
  const q = `%${params.search.trim()}%`;
  const entryMatchSubquery = db
    .select({ one: sql`1` })
    .from(ledgerEntries)
    .where(and(
      eq(ledgerEntries.sourceDocumentId, sourceDocuments.id),
      eq(ledgerEntries.ledgerId, ledgerId),
      or(like(ledgerEntries.itemName, q), like(ledgerEntries.description, q))
    ));

  conditions.push(
    or(
      like(sourceDocuments.title, q),
      like(sourceDocuments.text, q),
      exists(entryMatchSubquery)
    )
  );
}
```

优势：不改变现有"先查 docs 再查 entries"的两阶段结构。

### 状态与 URL 设计

#### 新增字段

```typescript
// ledger-url-params.ts
export interface LedgerFilterParams {
  // ...existing
  search: string | null;
}

export interface LedgerUrlUpdate {
  // ...existing
  search?: string | null;
}

// EntryFilters (EntryFilterPanel.tsx)
export interface EntryFilters {
  // ...existing
  search?: string | null;
}
```

#### URL 参数规则

- `search`：纯文本，最大 200 字符
- 空字符串或纯空格：视为无搜索条件，从 URL 中删除该参数
- 计入 `advancedFilterCount`（在 filter button 上显示 badge）

#### Filter Key 构建

`buildLedgerFilterKey` 增加 search 部分：`search:${query}`，确保不同搜索词的 React Query 缓存隔离。

### UI 设计

在 `EntryFilterPanel` 的 Popover 内，**日期筛选区上方**增加搜索区：

```
┌─────────────────────────────┐
│ 🔍 搜索...              [x] │  ← 新增：搜索输入框，带清除按钮
├─────────────────────────────┤
│ 📅 日期范围                   │  ← 现有
│ [本月] [近7天] [近30天] [自定义]│
├─────────────────────────────┤
│ 📂 分类                       │  ← 现有
│ ...                          │
└─────────────────────────────┘
```

- 输入框使用 `<Input>` 组件，placeholder 为"搜索条目或收据..."
- 实时输入（onChange），但和现有 filter 统一：点击 Apply 后才同步到 URL
- 右侧小 "x" 按钮清空搜索词
- 搜索词在 Popover 关闭后仍显示在输入框中（反映当前 URL 状态）

### Schema 变更

```typescript
// contract-schemas.ts
export const listLedgerEntriesInputSchema = strictObjectSchema({
  // ...existing
  search: z.string().max(200).optional(),
});

export const sourceDocumentCollectionInputSchema = strictObjectSchema({
  // ...existing
  search: z.string().max(200).optional(),
});

export const ledgerStatsQuerySchema = strictObjectSchema({
  // ...existing
  search: z.string().max(200).optional(),
});
```

### React Query 缓存键更新

```typescript
// query-keys.ts
// ledgerEntries key 增加 search
// summary key 增加 search
// sourceDocumentCollection key 增加 search
```

### i18n

```json
// messages/zh.json & messages/en.json
"EntryFilterPanel": {
  "searchPlaceholder": "搜索条目或收据...",
  // ...existing
}
```

### 边界情况

| 场景 | 行为 |
|------|------|
| 空搜索词 | 不添加条件，不计入 active filter count |
| 纯空格 | trim 后为空，同上 |
| 搜索 + 其他 filter 叠加 | `and(...)` 自然组合，所有条件同时满足 |
| 无匹配结果 | 显示现有空状态 "暂无记录" |
| URL 过长 | search 限制 200 字符，正常不会超限 |
| 手动创建的 entry（无 source doc）| 子查询自然处理，sourceDocumentId 为 null 时不匹配 |
| Source doc 无 entries | EXISTS 子查询返回 false，但 title/text 匹配仍返回 |

## 改动文件清单

### URL 状态与 Filter 管道
1. `src/modules/workspace/ledger-url-params.ts`
2. `src/modules/workspace/ledger-filter-state.ts`
3. `src/modules/workspace/initial-query-state.ts`

### UI
4. `src/modules/ledger/ui/EntryFilterPanel.tsx`

### Schema 校验
5. `src/modules/ledger/contract-schemas.ts`
6. `src/modules/source-document/contract-schemas.ts`

### Details tab 查询层
7. `src/modules/ledger/application/queries/build-ledger-entry-filters.ts`
8. `src/modules/ledger/application/queries/list-ledger-entry-page.ts`
9. `src/modules/ledger/hooks/useDetailsTabData.ts`
10. `src/modules/ledger/queries.ts`（透传 search）
11. `src/modules/ledger/server-actions/entries.ts`（透传 search）

### Stream tab 查询层
12. `src/modules/source-document/application/queries/list-source-document-collection.ts`
13. `src/modules/source-document/application/queries/source-document-query-*.ts`（如有需要）
14. `src/modules/source-document/hooks/useSourceDocumentCollection.ts`
15. `src/modules/source-document/server-actions/queries.ts`（透传 search）
16. `src/modules/source-document/queries.ts`（透传 search）

### Stats 查询
17. `src/modules/ledger/application/queries/get-ledger-stats.ts`

### React Query 缓存
18. `src/lib/query-keys.ts`

### Workspace hooks
19. `src/modules/workspace/hooks/usePeriodFilter.ts`
20. `src/modules/workspace/ui/useLedgerEntriesFilters.ts`
21. `src/modules/workspace/ui/useDetailsTabFilters.ts`

### i18n
22. `messages/en.json`
23. `messages/zh.json`

## 测试策略

- **单元测试**：`buildLedgerEntryFilterConditions` 增加 search 条件测试；URL 参数读写测试
- **集成测试**：端到端测试 details/stream 两个 tab 的搜索过滤结果正确性
- **边界测试**：空搜索词、超长搜索词、特殊字符、跨表匹配验证

## 性能考量

- SQLite LIKE 在数据量 < 10万条时性能可接受
- 子查询方式避免了 JOIN 导致的行膨胀
- 搜索词增加后 cursor 分页仍然正确工作（搜索条件在 cursor 条件之前应用）
