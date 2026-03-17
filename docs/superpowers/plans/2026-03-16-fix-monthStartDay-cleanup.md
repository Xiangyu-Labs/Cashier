# 修复 monthStartDay 删除残留问题实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复删除 monthStartDay 后的两个残留问题：1) StatsHeader 仍显示"本期"按钮；2) SQLite "near AND: syntax error"

**Architecture:** 彻底清理所有 currentPeriod 引用，修复 stats 模块中的 SQL 查询构造问题

**Tech Stack:** TypeScript, Next.js, Drizzle ORM, SQLite

---

## 问题分析

### 问题 1：StatsHeader.tsx 仍显示"本期"按钮

**根因：** `src/components/stats/StatsHeader.tsx` 第58行硬编码了 `currentPeriod`：
```typescript
{(["week", "month", "year", "currentPeriod"] as DateRangeType[]).map((type) => (
```

虽然 `DateRangeType` 类型已改为 `"week" | "month" | "year"`，但这里用类型断言 `as DateRangeType[]` 绕过了类型检查。

**影响范围：**
- `src/components/stats/StatsHeader.tsx` - 主文件
- `src/components/stats/StatsChart.tsx` - 第101行注释和第269行代码引用 currentPeriod
- `messages/en.json` 和 `messages/zh.json` - 仍有 currentPeriod 翻译键
- `src/features/ledger/components/EntryFilterPanel.tsx` - 有 legacy 兼容代码
- `src/app/[locale]/(protected)/ledger/[id]/page.tsx` - 注释提到 currentPeriod

### 问题 2：SQLite "near AND: syntax error"

**根因：** `src/features/stats/server/actions/index.ts` 第72-79行的 SQL 查询构造：
```typescript
where: and(
    q.whereActive,
    sql`${ledgerEntries.sourceDocumentId} IN (...)`
),
```

当 `q.whereActive` 在某些情况下可能生成不完整的 SQL，导致最终查询变成 `AND ...` 开头。

**具体分析：**
- `forLedger` 函数返回的 `whereActive` 是一个 getter，调用 `and(eq(table.ledgerId, ledgerId), isNull(table.deletedAt))`
- `ledgerEntries` 表有 `deletedAt` 列（软删除）
- 问题可能在于 `and()` 函数接收参数的方式

**需要检查：** `src/lib/db/scoped-query.ts` 中 `whereActive` 的实现

---

## 文件影响清单

| 类别 | 文件路径 | 操作 |
|------|----------|------|
| Stats 组件 | `src/components/stats/StatsHeader.tsx` | 删除 currentPeriod |
| Stats 组件 | `src/components/stats/StatsChart.tsx` | 删除 currentPeriod 引用 |
| Server Action | `src/features/stats/server/actions/index.ts` | 修复 SQL 查询 |
| Scoped Query | `src/lib/db/scoped-query.ts` | 检查/修复 whereActive |
| 工具函数 | `src/features/ledger/components/EntryFilterPanel.tsx` | 清理 legacy 兼容代码 |
| Page | `src/app/[locale]/(protected)/ledger/[id]/page.tsx` | 更新注释 |
| i18n | `messages/en.json` | 删除 currentPeriod 翻译 |
| i18n | `messages/zh.json` | 删除 currentPeriod 翻译 |

---

## Chunk 1: 修复 StatsHeader 和 StatsChart

### Task 1: 修复 StatsHeader.tsx

**Files:**
- Modify: `src/components/stats/StatsHeader.tsx`

- [ ] **Step 1.1: 删除 currentPeriod 按钮**

```typescript
// 修改第58行，删除 "currentPeriod"
// 从:
{(["week", "month", "year", "currentPeriod"] as DateRangeType[]).map((type) => (
// 改为:
{(["week", "month", "year"] as DateRangeType[]).map((type) => (
```

- [ ] **Step 1.2: 验证类型检查通过**

```bash
npx tsc --noEmit src/components/stats/StatsHeader.tsx
```

Expected: No errors

### Task 2: 修复 StatsChart.tsx

**Files:**
- Modify: `src/components/stats/StatsChart.tsx`

- [ ] **Step 2.1: 删除第101行的 currentPeriod 注释**

```typescript
// 从:
// Day number for Month or currentPeriod view
// 改为:
// Day number for Month view
```

- [ ] **Step 2.2: 修复第269行的 currentPeriod 条件**

```typescript
// 从:
} else if (rangeType === "month" || rangeType === "currentPeriod") {
// 改为:
} else if (rangeType === "month") {
```

- [ ] **Step 2.3: 验证类型检查通过**

```bash
npx tsc --noEmit src/components/stats/StatsChart.tsx
```

Expected: No errors

---

## Chunk 2: 修复 SQLite 语法错误

### Task 3: 检查并修复 scoped-query.ts

**Files:**
- Read: `src/lib/db/scoped-query.ts`

先读取文件确认 `whereActive` 的实现是否有问题。

**预期问题：**
当表没有 `deletedAt` 列时，`conditions` 数组只有一项，`and(...conditions)` 应该没问题。
但当表有 `deletedAt` 列时，`conditions` 有两项，`and(eq(...), isNull(...))` 应该也没问题。

**可能的原因：**
在 `src/features/stats/server/actions/index.ts` 中，`and()` 的参数可能有问题。

### Task 4: 修复 getEnhancedStats 中的 SQL 查询

**Files:**
- Modify: `src/features/stats/server/actions/index.ts`

- [ ] **Step 4.1: 检查并修复 fetchEntries 函数**

```typescript
// 当前问题代码（第72-79行）:
where: and(
    q.whereActive,
    sql`${ledgerEntries.sourceDocumentId} IN (...)`
),

// 问题分析：
// q.whereActive 是一个 getter，它返回 SQL 对象
// 但如果在某些情况下它返回 undefined，and() 可能会生成无效 SQL

// 修复方案：确保 whereActive 正确展开
const baseWhere = q.whereActive;
if (!baseWhere) {
    throw new Error("Failed to generate base where clause");
}

where: and(
    baseWhere,
    sql`${ledgerEntries.sourceDocumentId} IN (...)`
),
```

但更好的修复方式是直接使用原始条件：

```typescript
// 替代修复方案 - 直接使用 eq 和 isNull：
import { isNull } from "drizzle-orm";

where: and(
    eq(ledgerEntries.ledgerId, ledgerId),
    isNull(ledgerEntries.deletedAt),
    sql`${ledgerEntries.sourceDocumentId} IN (...)`
),
```

这样可以避免 `forLedger` 可能带来的问题。

- [ ] **Step 4.2: 运行测试验证修复**

```bash
npx vitest run tests/integration/stats/enhanced-stats.test.ts --reporter=verbose
```

Expected: All tests pass

---

## Chunk 3: 清理其他 currentPeriod 引用

### Task 5: 清理 EntryFilterPanel 中的 legacy 代码

**Files:**
- Modify: `src/features/ledger/components/EntryFilterPanel.tsx`

- [ ] **Step 5.1: 删除 currentPeriod 兼容映射**

```typescript
// 第115-116行，删除以下代码：
// Map legacy "currentPeriod" to "thisMonth"
if (preset === "currentPeriod") return "thisMonth";
```

### Task 6: 更新 page.tsx 注释

**Files:**
- Modify: `src/app/[locale]/(protected)/ledger/[id]/page.tsx`

- [ ] **Step 6.1: 更新注释**

```typescript
// 第24行，从:
// Parse period from URL (default: currentPeriod)
// 改为:
// Parse period from URL (default: thisMonth)
```

### Task 7: 删除 i18n 中的 currentPeriod 翻译

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 7.1: 删除 en.json 中的 currentPeriod 翻译**

查找并删除：
```json
"currentPeriod": "Current Period",
```
和
```json
"currentPeriod": "Period",
```

- [ ] **Step 7.2: 删除 zh.json 中的 currentPeriod 翻译**

查找并删除：
```json
"currentPeriod": "本期",
```
（有两处）

---

## Chunk 4: 最终验证

### Task 8: 全面验证

- [ ] **Step 8.1: 搜索所有残留的 currentPeriod**

```bash
grep -r "currentPeriod" --include="*.ts" --include="*.tsx" --include="*.json" src/ messages/ || echo "No currentPeriod references found"
```

Expected: "No currentPeriod references found" 或只显示在注释中的无害引用

- [ ] **Step 8.2: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: No errors related to our changes

- [ ] **Step 8.3: 运行 stats 相关测试**

```bash
npx vitest run tests/integration/stats/ --reporter=verbose
```

Expected: All tests pass

- [ ] **Step 8.4: 运行所有测试**

```bash
npm run test:run
```

Expected: All tests pass

- [ ] **Step 8.5: 构建项目**

```bash
npm run build
```

Expected: Build succeeds

---

## 执行说明

### 优先级
1. **高优先级**：修复 StatsHeader.tsx（用户可见问题）
2. **高优先级**：修复 SQLite 错误（功能不可用）
3. **低优先级**：清理其他 currentPeriod 引用和翻译

### 测试建议
- 在浏览器中打开统计页面，确认"本期"按钮已消失
- 切换"周/月/年"按钮，确认功能正常
- 检查控制台是否有 SQLite 错误

### 回滚说明
如果修复 SQL 查询时出现问题，可以回滚到使用 `forLedger` 的方式，但需要进一步调查 `whereActive` 的具体问题。
