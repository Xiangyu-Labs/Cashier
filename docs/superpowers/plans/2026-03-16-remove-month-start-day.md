# 删除每月起始日功能实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底删除项目中所有与"每月起始日"(monthStartDay)相关的代码和功能

**Architecture:** 该功能涉及数据库 schema、Server Actions、工具函数、React Hooks、UI 组件和测试。删除时需要从底层向上层逐层移除，确保类型安全和功能完整。

**Tech Stack:** TypeScript, Next.js, Drizzle ORM, SQLite, React, next-intl

---

## 文件影响清单

| 类别 | 文件路径 | 操作 |
|------|----------|------|
| Schema | `src/features/ledger/server/schema.ts` | 删除 `monthStartDay` 字段 |
| Schema | `src/features/ledger/server/actions/schemas.ts` | 删除验证规则 |
| Utils | `src/lib/date-utils.ts` | 删除 `currentPeriod` 类型和相关逻辑 |
| Utils | `src/lib/period-utils.ts` | 删除 `monthStartDay` 参数和 `getBillingPeriod` 函数 |
| Hooks | `src/features/ledger/client/hooks/use-period-filter.ts` | 删除 `monthStartDay` 参数 |
| Hooks | `src/features/ledger/client/hooks/use-ledger-settings.ts` | 删除相关 mutation 逻辑 |
| Components | `src/features/ledger/components/SettingsTab.tsx` | 删除设置 UI |
| Components | `src/features/ledger/components/EntryFilterPanel.tsx` | 删除 prop 和相关调用 |
| Components | `src/features/ledger/components/StatsTab.tsx` | 删除相关逻辑 |
| Components | `src/features/ledger/components/DetailsTab.tsx` | 删除 prop 传递 |
| Components | `src/features/ledger/components/LedgerEntriesTab/index.tsx` | 删除 prop 传递 |
| Components | `src/features/ledger/components/LedgerPageClient/index.tsx` | 删除相关逻辑 |
| Page | `src/app/[locale]/(protected)/ledger/[id]/page.tsx` | 删除相关逻辑 |
| i18n | `messages/en.json` | 删除翻译键 |
| i18n | `messages/zh.json` | 删除翻译键 |
| Tests | `tests/unit/lib/period-utils.test.ts` | 删除相关测试 |
| Tests | `tests/unit/hooks/usePeriodFilter.test.ts` | 删除相关测试 |

---

## Task 1: 删除 Schema 层代码

**Files:**
- Modify: `src/features/ledger/server/schema.ts`
- Modify: `src/features/ledger/server/actions/schemas.ts`

- [ ] **Step 1.1: 删除 LedgerMetadata 中的 monthStartDay 字段**

```typescript
// src/features/ledger/server/schema.ts
// 找到 LedgerMetadata 接口，删除 monthStartDay 行

export interface LedgerMetadata {
    settings?: {
        aiLanguage?: string;
        currencies?: string[];
        mainCurrency?: string;
        collapseEntriesDefault?: boolean;
        aiCustomPrompt?: string;
        // 删除: monthStartDay?: number;      // 每月起始日 (1-31)，默认 1
    };
}
```

- [ ] **Step 1.2: 删除 updateLedgerSchema 中的 monthStartDay**

```typescript
// src/features/ledger/server/actions/schemas.ts
// 删除 monthStartDay 验证规则

export const updateLedgerSchema = z.object({
    settings: z.object({
        aiLanguage: z.string().optional(),
        currencies: z.array(z.string()).optional(),
        mainCurrency: z.string().optional(),
        collapseEntriesDefault: z.boolean().optional(),
        aiCustomPrompt: z.string().optional(),
        // 删除: monthStartDay: z.number().min(1).max(31).optional(),
    }).optional(),
});
```

- [ ] **Step 1.3: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: 可能出现类型错误（预期内，后续任务修复）

---

## Task 2: 删除工具函数中的 monthStartDay 逻辑

**Files:**
- Modify: `src/lib/date-utils.ts`
- Modify: `src/lib/period-utils.ts`

- [ ] **Step 2.1: 修改 date-utils.ts 删除 currentPeriod 类型和相关函数**

```typescript
// src/lib/date-utils.ts

// 1. 删除 currentPeriod 类型
export type DateRangeType = "week" | "month" | "year"; // 删除 "currentPeriod"

// 2. 修改 getDateRange 函数签名和实现
export function getDateRange(date: Date, type: DateRangeType): DateRange {
    let start: Date;
    let end: Date;

    switch (type) {
        case "week":
            start = getStartOfWeek(date);
            end = getEndOfWeek(date);
            break;
        case "month":
            start = getStartOfMonth(date);
            end = getEndOfMonth(date);
            break;
        case "year":
            start = getStartOfYear(date);
            end = getEndOfYear(date);
            break;
        // 删除整个 case "currentPeriod" 块
    }

    return { startDate: start, endDate: end };
}

// 3. 删除 getBillingPeriodRange 函数（整个函数约 25 行）
// 删除从 "function getBillingPeriodRange" 到函数结束的所有代码

// 4. 修改 addPeriod 函数
export function addPeriod(date: Date, type: DateRangeType, amount: number): Date {
    switch (type) {
        case "week":
            return addWeeks(date, amount);
        case "month":
            return addMonths(date, amount);
        case "year":
            return addYears(date, amount);
        // 删除 case "currentPeriod" 块
    }
}
```

- [ ] **Step 2.2: 修改 period-utils.ts**

```typescript
// src/lib/period-utils.ts

// 1. 修改 PeriodPreset 类型
export type PeriodPreset = 'all' | 'thisMonth' | 'week' | 'custom'; // 删除 'currentPeriod'

// 2. 修改 PeriodParams 接口
export interface PeriodParams {
    period: PeriodPreset;
    startDate?: string;
    endDate?: string;
    // 删除: monthStartDay?: number;
}

// 3. 删除整个 getBillingPeriod 函数（约 30 行）

// 4. 修改 periodToDateRange 函数
export function periodToDateRange(params: PeriodParams): DateRange {
    const { period, startDate, endDate } = params;

    // 删除整个 if (period === 'currentPeriod') 块（约 10 行）

    if (period === 'all') {
        return { startDate: null, endDate: null };
    }

    // ... rest of the function

    // 删除最后的 default case 中使用 getBillingPeriod 的代码
    // 改为直接返回 thisMonth 或 all
}
```

- [ ] **Step 2.3: 运行测试验证工具函数**

```bash
npx vitest run tests/unit/lib/period-utils.test.ts --reporter=verbose
npx vitest run tests/unit/lib/date-utils.test.ts --reporter=verbose
```

Expected: 测试可能需要更新（见 Task 6）

---

## Task 3: 删除 Hooks 中的 monthStartDay 逻辑

**Files:**
- Modify: `src/features/ledger/client/hooks/use-period-filter.ts`
- Modify: `src/features/ledger/client/hooks/use-ledger-settings.ts`

- [ ] **Step 3.1: 修改 use-period-filter.ts**

```typescript
// src/features/ledger/client/hooks/use-period-filter.ts

// 1. 修改接口定义
interface UsePeriodFilterParams {
    pathname: string;
    searchParams: URLSearchParams;
    initialPeriod: PeriodParams;
    // 删除: monthStartDay?: number;
}

// 2. 修改函数签名
export function usePeriodFilter({
    pathname,
    searchParams,
    initialPeriod: _initialPeriod
    // 删除: monthStartDay = 1
}: UsePeriodFilterParams): UsePeriodFilterReturn {

    // 3. 修改 useMemo 中的逻辑
    const periodParams = useMemo<PeriodParams>(() => {
        const parsed = parsePeriodFromSearchParams(searchParams);
        // 删除: if (parsed.period === 'currentPeriod') 块
        return parsed;
    }, [searchParams]); // 删除 monthStartDay 依赖

    // 4. 删除 handleFiltersChange 中注入 monthStartDay 的逻辑
    // 查找 handlePeriodChange({ period: 'currentPeriod', monthStartDay })
    // 改为 handlePeriodChange({ period: 'thisMonth' })
}
```

- [ ] **Step 3.2: 修改 use-ledger-settings.ts**

```typescript
// src/features/ledger/client/hooks/use-ledger-settings.ts

// 1. 修改 UpdateLedgerData 接口
interface UpdateLedgerData {
    preferredCurrencies?: string[];
    mainCurrency?: string;
    aiLanguage?: string;
    collapseEntriesDefault?: boolean;
    aiCustomPrompt?: string;
    // 删除: monthStartDay?: number;
}

// 2. 删除 mutationFn 中处理 monthStartDay 的代码
// 查找: if (monthStartDay !== undefined) settings.monthStartDay = monthStartDay;

// 3. 删除 onOptimisticUpdate 中处理 monthStartDay 的代码
// 查找: newData.monthStartDay !== undefined 相关的条件判断和设置
```

---

## Task 4: 删除 UI 组件中的 monthStartDay

**Files:**
- Modify: `src/features/ledger/components/SettingsTab.tsx`
- Modify: `src/features/ledger/components/EntryFilterPanel.tsx`
- Modify: `src/features/ledger/components/StatsTab.tsx`

- [ ] **Step 4.1: 删除 SettingsTab.tsx 中的设置 UI**

```tsx
// src/features/ledger/components/SettingsTab.tsx

// 在 Ledger Settings 区块中，删除以下代码（约 20 行）:
/*
<div className="h-px bg-[var(--border)]" />

{ Billing Cycle - Month Start Day }
<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <div>
        <h3 className="text-base font-medium">{t('monthStartDay')}</h3>
        <p className="text-sm text-[var(--muted)]">{t('monthStartDayDesc')}</p>
    </div>
    <select
        value={settingsLedger.metadata?.settings?.monthStartDay || 1}
        onChange={(e) => updateLedgerMutation.mutate({ monthStartDay: parseInt(e.target.value) })}
        disabled={isPending}
        className="..."
    >
        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
            <option key={day} value={day}>{day}</option>
        ))}
    </select>
</div>
*/
```

- [ ] **Step 4.2: 修改 EntryFilterPanel.tsx**

```typescript
// src/features/ledger/components/EntryFilterPanel.tsx

// 1. 修改接口
interface EntryFilterPanelProps {
    // ... 其他属性
    // 删除: monthStartDay?: number;
}

// 2. 修改函数参数默认值
export function EntryFilterPanel({
    // ...
    // 删除: monthStartDay = 1,
}: EntryFilterPanelProps) {

// 3. 删除 getBillingPeriod 调用
// 将: const billing = getBillingPeriod(monthStartDay);
// 改为: 使用新的默认日期范围逻辑（如 thisMonth）

// 4. 修改 handleDatePresetLegacy 中的 currentPeriod 逻辑
// 删除或替换为 thisMonth
}
```

- [ ] **Step 4.3: 修改 StatsTab.tsx**

```typescript
// src/features/ledger/components/StatsTab.tsx

// 1. 删除 monthStartDay 获取逻辑
// 删除: const monthStartDay = ledger?.metadata?.settings?.monthStartDay ?? 1;

// 2. 修改 getDateRange 调用
// 从: getDateRange(currentDate, rangeType, monthStartDay)
// 改为: getDateRange(currentDate, rangeType)

// 3. 删除 useMemo 中 monthStartDay 的依赖
```

---

## Task 5: 修改页面级组件

**Files:**
- Modify: `src/app/[locale]/(protected)/ledger/[id]/page.tsx`
- Modify: `src/features/ledger/components/LedgerPageClient/index.tsx`
- Modify: `src/features/ledger/components/DetailsTab.tsx`
- Modify: `src/features/ledger/components/LedgerEntriesTab/index.tsx`

- [ ] **Step 5.1: 修改 page.tsx**

```typescript
// src/app/[locale]/(protected)/ledger/[id]/page.tsx

// 1. 删除 monthStartDay 获取逻辑
// 删除: const monthStartDay = ledger?.metadata?.settings?.monthStartDay ?? 1;

// 2. 简化 enrichedPeriodParams 逻辑
// 删除: const enrichedPeriodParams = periodParams.period === 'currentPeriod' ...
// 改为: const dateRange = periodToDateRange(periodParams);

// 3. 修改传递给 LedgerPageClient 的 props
// 从: initialPeriod={enrichedPeriodParams}
// 改为: initialPeriod={periodParams}
```

- [ ] **Step 5.2: 修改 LedgerPageClient/index.tsx**

```typescript
// src/features/ledger/components/LedgerPageClient/index.tsx

// 1. 删除 monthStartDay 获取
// 删除: const monthStartDay = ledger?.metadata?.settings?.monthStartDay || 1;

// 2. 修改 usePeriodFilter 调用
// 删除: monthStartDay 参数

// 3. 删除传递给子组件的 monthStartDay prop
// 从: monthStartDay={monthStartDay}
// 删除这些 prop
```

- [ ] **Step 5.3: 修改 DetailsTab.tsx 和 LedgerEntriesTab/index.tsx**

在两个文件中：
```typescript
// 1. 删除接口中的 monthStartDay prop
interface XxxTabProps {
    // ...
    // 删除: monthStartDay?: number;
}

// 2. 删除函数参数中的默认值
// 删除: monthStartDay = 1,

// 3. 删除传递给 EntryFilterPanel 的 monthStartDay prop
```

---

## Task 6: 删除测试代码

**Files:**
- Modify: `tests/unit/lib/period-utils.test.ts`
- Modify: `tests/unit/hooks/usePeriodFilter.test.ts`

- [ ] **Step 6.1: 修改 period-utils.test.ts**

```typescript
// tests/unit/lib/period-utils.test.ts

// 1. 删除 getBillingPeriod 相关的测试 describe 块
// 删除整个 describe('getBillingPeriod', () => { ... });

// 2. 修改测试中的 PeriodParams 类型使用
// 删除所有使用 monthStartDay 的测试用例

// 3. 修改引用 currentPeriod 的测试
// 将这些测试改为使用 thisMonth 或直接删除
```

- [ ] **Step 6.2: 修改 usePeriodFilter.test.ts**

```typescript
// tests/unit/hooks/usePeriodFilter.test.ts

// 1. 删除使用 monthStartDay 参数的测试
// 删除: it("should use monthStartDay for currentPeriod calculation", () => { ... });

// 2. 删除测试中传给 usePeriodFilter 的 monthStartDay 参数
```

- [ ] **Step 6.3: 运行所有测试**

```bash
npm run test:run
```

Expected: All tests pass

---

## Task 7: 删除翻译键

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 7.1: 删除 en.json 中的翻译**

```json
// messages/en.json - Settings 区块
// 删除:
"monthStartDay": "Billing Cycle Start",
"monthStartDayDesc": "The day of the month when the billing cycle starts",
```

- [ ] **Step 7.2: 删除 zh.json 中的翻译**

```json
// messages/zh.json - Settings 区块
// 删除:
"monthStartDay": "每月起始日",
"monthStartDayDesc": "账单周期从每月第几天开始计算",
```

---

## Task 8: 清理 PRD 文档中的引用

**Files:**
- Modify: `docs/architecture/PRD.md`

- [ ] **Step 8.1: 删除或修改 PRD 中的 monthStartDay 引用**

```markdown
// docs/architecture/PRD.md
// 查找并删除或修改:
| **当前周期汇总** | 基于 monthStartDay 的周期统计 |
```

---

## Task 9: 最终验证

- [ ] **Step 9.1: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 9.2: 运行所有测试**

```bash
npm run test:run
```

Expected: All tests pass

- [ ] **Step 9.3: 运行 Lint**

```bash
npm run lint
```

Expected: No errors

- [ ] **Step 9.4: 构建项目**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 9.5: 搜索残留引用**

```bash
grep -r "monthStartDay\|month_start_day\|每月起始日" --include="*.ts" --include="*.tsx" --include="*.json" src/ messages/ tests/ || echo "No references found - cleanup complete!"
```

Expected: "No references found"

---

## 回滚说明

如果在实施过程中遇到问题，可以按以下顺序回滚：

1. 恢复 translations（最简单）
2. 恢复 Schema（数据库字段添加需 migration）
3. 恢复工具函数
4. 恢复组件

注意：此功能存储在 `ledger.metadata.settings.monthStartDay`，删除后数据库中已存在的数据不会自动清除，但代码不再读取该字段。
