# Comprehensive i18n Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all hardcoded Chinese and English strings in the codebase, ensuring all user-visible content is properly internationalized while keeping logs and technical comments in English.

**Architecture:** Extend existing next-intl translation system (messages/zh.json, messages/en.json) with new namespaces for calendar, stats, and AI prompts. Convert all hardcoded UI strings to use `useTranslations()` hooks.

**Tech Stack:** next-intl, React, TypeScript, React Toast

---

## Overview

This plan addresses three categories of hardcoded text:
1. **User-visible Chinese text** → Add to translation files, use `t()` hook
2. **User-visible English text** → Add to translation files, use `t()` hook
3. **Chinese code comments** → Translate to English (logs stay English)

**Scope:** 15+ files across calendar, stats, settings, and shared components.

---

## Chunk 1: Translation File Extensions

**Goal:** Add all missing translation keys before component updates.

### Task 1.1: Extend messages/zh.json with Calendar Namespace

**Files:**
- Modify: `messages/zh.json`

**Analysis:** Add missing calendar-related translations.

- [ ] **Step 1: Add Calendar namespace entries**

```json
{
  "Calendar": {
    "today": "今天",
    "yesterday": "昨天",
    "clear": "清除",
    "weekDays": ["日", "一", "二", "三", "四", "五", "六"],
    "currency": "货币",
    "allCurrencies": "全部货币",
    "category": "分类",
    "allCategories": "全部分类",
    "uncategorized": "未分类",
    "reset": "重置",
    "loading": "加载中…",
    "noData": "暂无数据",
    "less": "少",
    "more": "多",
    "totalExpense": "总支出",
    "totalCount": "总笔数",
    "dailyAverage": "日均",
    "count": "{count}笔",
    "expense": "支出",
    "noConsumption": "无消费",
    "year": "年",
    "month": "月",
    "dateFormat": "{year}年{month}月",
    "scaleAdjusted": "已调整显示比例",
    "exceedsLimit": "超出显示上限",
    "productName": "商品名称",
    "notes": "备注"
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/zh.json'))"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add messages/zh.json
git commit -m "feat(i18n): add Calendar namespace to zh translations"
```

### Task 1.2: Extend messages/en.json with Calendar Namespace

**Files:**
- Modify: `messages/en.json`

- [ ] **Step 1: Add Calendar namespace entries**

```json
{
  "Calendar": {
    "today": "Today",
    "yesterday": "Yesterday",
    "clear": "Clear",
    "weekDays": ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
    "currency": "Currency",
    "allCurrencies": "All Currencies",
    "category": "Category",
    "allCategories": "All Categories",
    "uncategorized": "Uncategorized",
    "reset": "Reset",
    "loading": "Loading…",
    "noData": "No data",
    "less": "Less",
    "more": "More",
    "totalExpense": "Total Expense",
    "totalCount": "Total Count",
    "dailyAverage": "Daily Avg",
    "count": "{count} entries",
    "expense": "Expense",
    "noConsumption": "No consumption",
    "year": "Year",
    "month": "Month",
    "dateFormat": "{month} {year}",
    "scaleAdjusted": "Scale adjusted",
    "exceedsLimit": "(exceeds display limit)",
    "productName": "Product Name",
    "notes": "Notes"
  }
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json'))"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "feat(i18n): add Calendar namespace to en translations"
```

### Task 1.3: Extend messages with StatsChart Namespace

**Files:**
- Modify: `messages/zh.json`, `messages/en.json`

- [ ] **Step 1: Add to zh.json**

```json
{
  "StatsChart": {
    "scaleAdjusted": "已调整显示比例",
    "expense": "支出",
    "exceedsLimit": "（超出显示上限）"
  }
}
```

- [ ] **Step 2: Add to en.json**

```json
{
  "StatsChart": {
    "scaleAdjusted": "Scale adjusted",
    "expense": "Expense",
    "exceedsLimit": "(exceeds display limit)"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add messages/zh.json messages/en.json
git commit -m "feat(i18n): add StatsChart namespace"
```

---

## Chunk 2: Calendar Components

**Goal:** Replace all hardcoded Chinese in calendar components.

### Task 2.1: Fix CalendarFilters.tsx

**Files:**
- Modify: `src/features/calendar/components/CalendarFilters.tsx`

Current hardcoded strings:
- Line 53: `"货币"`
- Line 64: `placeholder="全部货币"`
- Line 67: `"全部货币"`
- Line 80: `"分类"`
- Line 91: `placeholder="全部分类"`
- Line 94: `"全部分类"`
- Line 95: `"未分类"`
- Line 114: `"重置"`

- [ ] **Step 1: Add useTranslations import and hook**

```typescript
import { useTranslations } from 'next-intl';

export function CalendarFilters({...}: CalendarFiltersProps) {
  const t = useTranslations('Calendar');
  // ... rest of component
}
```

- [ ] **Step 2: Replace hardcoded strings**

```tsx
{/* Currency Filter */}
<span className="text-xs text-muted-foreground">{t('currency')}</span>
<SelectValue placeholder={t('allCurrencies')} />
<SelectItem value="__all__">{t('allCurrencies')}</SelectItem>

{/* Category Filter */}
<span className="text-xs text-muted-foreground">{t('category')}</span>
<SelectValue placeholder={t('allCategories')} />
<SelectItem value="__all__">{t('allCategories')}</SelectItem>
<SelectItem value="__uncategorized__">{t('uncategorized')}</SelectItem>

{/* Reset Button */}
<X className="h-3 w-3 mr-1" />
{t('reset')}
```

- [ ] **Step 3: Run type check**

Run: `npm run lint`
Expected: No errors in CalendarFilters.tsx

- [ ] **Step 4: Commit**

```bash
git add src/features/calendar/components/CalendarFilters.tsx
git commit -m "fix(i18n): internationalize CalendarFilters component"
```

### Task 2.2: Fix CalendarHeatmapSection.tsx

**Files:**
- Modify: `src/features/calendar/components/CalendarHeatmapSection.tsx`

Current hardcoded strings:
- Line 64: `"暂无数据"`
- Line 76: `"少"`
- Line 87: `"多"`

- [ ] **Step 1: Add useTranslations and replace strings**

```typescript
import { useTranslations } from 'next-intl';

export function CalendarHeatmapSection({...}: Props) {
  const t = useTranslations('Calendar');

  if (data.length === 0) {
    return (
      <div className="...">
        {t('noData')}
      </div>
    );
  }

  // Legend
  <span className="text-xs text-muted-foreground">{t('less')}</span>
  <span className="text-xs text-muted-foreground">{t('more')}</span>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/CalendarHeatmapSection.tsx
git commit -m "fix(i18n): internationalize CalendarHeatmapSection"
```

### Task 2.3: Fix YearView/index.tsx

**Files:**
- Modify: `src/features/calendar/components/YearView/index.tsx`

Current hardcoded strings:
- Line 33: `const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];`
- Line 117: `"总支出:"`
- Line 123: `"总笔数:"`
- Line 127: `"日均:"`
- Line 124: `{stats.totalCount}笔`

- [ ] **Step 1: Replace weekday labels with translation**

```typescript
import { useTranslations } from 'next-intl';

export function YearView({...}: Props) {
  const t = useTranslations('Calendar');
  const weekdayLabels = t.raw('weekDays'); // Use the array from translations
  // ...
}
```

- [ ] **Step 2: Replace stats labels**

```tsx
<div className="flex items-center gap-1">
  <span>{t('totalExpense')}:</span>
</div>
<div className="flex items-center gap-1">
  <span>{t('totalCount')}:</span>
  <span>{t('count', { count: stats.totalCount })}</span>
</div>
<div className="flex items-center gap-1">
  <span>{t('dailyAverage')}:</span>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/features/calendar/components/YearView/index.tsx
git commit -m "fix(i18n): internationalize YearView component"
```

### Task 2.4: Fix YearView/DayCell.tsx

**Files:**
- Modify: `src/features/calendar/components/YearView/DayCell.tsx`

Current hardcoded strings:
- Line 27: `"支出:"`、`"笔数:"`、`"笔"`、`"无消费"`

- [ ] **Step 1: Add translations**

```typescript
import { useTranslations } from 'next-intl';

export function DayCell({...}: DayCellProps) {
  const t = useTranslations('Calendar');

  const tooltipText = amount > 0
    ? `${date}\n${t('expense')}: ${formatAmount(amount)}\n${t('count', { count })}`
    : `${date}\n${t('noConsumption')}`;

  // In tooltip:
  <div>{t('expense')}: {formatAmount(amount)}</div>
  <div>{t('count', { count })}</div>
  <div className="text-muted-foreground">{t('noConsumption')}</div>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/YearView/DayCell.tsx
git commit -m "fix(i18n): internationalize DayCell tooltip"
```

### Task 2.5: Fix MonthView.tsx

**Files:**
- Modify: `src/features/calendar/components/MonthView.tsx`

Current hardcoded strings:
- Line 37: `const weekdays = ['日', '一', '二', '三', '四', '五', '六'];`

- [ ] **Step 1: Use translations for weekday labels**

```typescript
import { useTranslations } from 'next-intl';

export function MonthView({...}: Props) {
  const t = useTranslations('Calendar');
  const weekdays = t.raw('weekDays');
  // ...
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/MonthView.tsx
git commit -m "fix(i18n): internationalize MonthView weekday labels"
```

### Task 2.6: Fix CalendarTab.tsx

**Files:**
- Modify: `src/features/calendar/components/CalendarTab.tsx`

Current hardcoded strings:
- Line 136: `"加载中…"`
- Line 140: `"暂无数据"`

- [ ] **Step 1: Add translations**

```typescript
import { useTranslations } from 'next-intl';

export function CalendarTab({...}: Props) {
  const t = useTranslations('Calendar');

  {isLoading ? (
    <div>{t('loading')}</div>
  ) : !calendarData ? (
    <div>{t('noData')}</div>
  )}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/CalendarTab.tsx
git commit -m "fix(i18n): internationalize CalendarTab loading states"
```

### Task 2.7: Fix CalendarHeader.tsx

**Files:**
- Modify: `src/features/calendar/components/CalendarHeader.tsx`

Current hardcoded strings:
- Line 99: `month: '月'`
- Line 100: `year: '年'`
- Line 108: `${year}年${month}月`

- [ ] **Step 1: Add translations**

```typescript
import { useTranslations } from 'next-intl';

export function CalendarHeader({...}: Props) {
  const t = useTranslations('Calendar');

  const unitLabels = {
    month: t('month'),
    year: t('year'),
  };

  // For date format, use interpolation
  case 'month':
    return t('dateFormat', { year, month });
}
```

Note: Update `dateFormat` in zh.json to use `{year}年{month}月` and en.json to use `{month} {year}`.

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/CalendarHeader.tsx
git commit -m "fix(i18n): internationalize CalendarHeader date formats"
```

### Task 2.8: Fix AdaptiveHeatmap components

**Files:**
- Modify: `src/features/calendar/components/AdaptiveHeatmap/DayCellSmall.tsx`
- Modify: `src/features/calendar/components/AdaptiveHeatmap/DayCellLarge.tsx`

Current hardcoded strings: Same as DayCell.tsx ("支出:", "笔数:", "无消费")

- [ ] **Step 1: Apply same fixes as DayCell.tsx to both files**

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/AdaptiveHeatmap/
git commit -m "fix(i18n): internationalize AdaptiveHeatmap DayCell components"
```

### Task 2.9: Fix HeatmapCell.tsx

**Files:**
- Modify: `src/features/calendar/components/HeatmapCell.tsx`

Current hardcoded strings:
- Line 103: `{count}笔`

- [ ] **Step 1: Add translation**

```tsx
<span>{t('count', { count })}</span>
```

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/HeatmapCell.tsx
git commit -m "fix(i18n): internationalize HeatmapCell count display"
```

---

## Chunk 3: Stats Components

### Task 3.1: Fix StatsChart.tsx

**Files:**
- Modify: `src/components/stats/StatsChart.tsx`

Current hardcoded strings:
- Line 161: `"已调整显示比例"`
- Line 252: `"支出:"`
- Line 253: `" (超出显示上限)"`

- [ ] **Step 1: Add useTranslations**

```typescript
import { useTranslations } from 'next-intl';

export function StatsChart({...}: Props) {
  const t = useTranslations('StatsChart');
  // ...
}
```

- [ ] **Step 2: Replace strings**

```tsx
{/* Outlier indicator */}
<div>{t('scaleAdjusted')}</div>

{/* Tooltip */}
<div>{t('expense')}: ¥{p.value.toLocaleString()}</div>
{isCapped && t('exceedsLimit')}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/StatsChart.tsx
git commit -m "fix(i18n): internationalize StatsChart component"
```

---

## Chunk 4: Shared Components

### Task 4.1: Fix calendar.tsx (shadcn/ui)

**Files:**
- Modify: `src/components/ui/calendar.tsx`

Current hardcoded strings:
- Line 28: Comment `"是否显示快捷选项"`
- Line 148: `"yyyy年M月"`

- [ ] **Step 1: Translate comment to English**

```typescript
/** Whether to show shortcut options */
```

- [ ] **Step 2: Use locale-based date formatting instead of hardcoded format**

The date format should use the locale from useTranslations or pass through Intl.DateTimeFormat.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/calendar.tsx
git commit -m "fix(i18n): translate comments and use locale date format in calendar"
```

### Task 4.2: Fix EditableLedgerEntryItem.tsx

**Files:**
- Modify: `src/components/entries/EditableLedgerEntryItem.tsx`

Current hardcoded strings:
- Line 119: `placeholder="商品名称"`
- Line 134: `placeholder="备注"`

- [ ] **Step 1: Add translations**

```typescript
import { useTranslations } from 'next-intl';

export function EditableLedgerEntryItem({...}: Props) {
  const t = useTranslations('Calendar'); // or create Entry namespace

  placeholder={t('productName')}
  placeholder={t('notes')}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/entries/EditableLedgerEntryItem.tsx
git commit -m "fix(i18n): internationalize EditableLedgerEntryItem placeholders"
```

### Task 4.3: Fix LanguageSwitcher.tsx

**Files:**
- Modify: `src/components/LanguageSwitcher.tsx`

Current hardcoded strings:
- Line 32: `"中文"`
- Line 36: `"English"`

- [ ] **Step 1: These are language names - keep as-is or use native names**

Language names should remain in their native form (中文, English) as this is standard practice.

**Decision:** Keep unchanged - language names are proper nouns and should display in native script.

---

## Chunk 5: Comments Translation

### Task 5.1: Fix SourceDocumentCard.tsx Comments

**Files:**
- Modify: `src/features/source-document/components/SourceDocumentCard.tsx`

Current hardcoded comments:
- Line 271: `{/* 左侧折叠按钮 */}`
- Line 283: `{/* 中间主体 - 点击打开详情（非选择模式下） */}`
- Line 315: `{/* 右侧 - 状态、金额和菜单 */}`

- [ ] **Step 1: Translate comments to English**

```tsx
{/* Left collapse button */}
{/* Middle section - click to open details (non-selection mode) */}
{/* Right section - status, amount and menu */}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/source-document/components/SourceDocumentCard.tsx
git commit -m "docs: translate Chinese comments to English in SourceDocumentCard"
```

### Task 5.2: Fix LedgerPageClient/index.tsx Comments

**Files:**
- Modify: `src/features/ledger/components/LedgerPageClient/index.tsx`

Current hardcoded comments:
- Line 86: `// 2秒后预加载记一笔弹窗数据`
- Line 125: `// Advanced filters now come from URL`

- [ ] **Step 1: Translate Chinese comment to English**

```typescript
// Prefetch input modal data after 2 seconds
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ledger/components/LedgerPageClient/index.tsx
git commit -m "docs: translate Chinese comment to English"
```

### Task 5.3: Fix TabSkeletons.tsx Comments

**Files:**
- Modify: `src/components/skeletons/TabSkeletons.tsx`

Current hardcoded comments:
- Line 50: `* Skeleton for the Details (明细) tab.`
- Line 80: `* Skeleton for the Stats (统计) tab.`
- Line 113: `* Skeleton for the Settings (设置) tab.`

- [ ] **Step 1: Translate or remove Chinese from comments**

```typescript
/**
 * Skeleton for the Details tab.
 * Shows a list of detail item placeholders.
 */

/**
 * Skeleton for the Stats tab.
 * Shows chart area + summary card placeholders.
 */

/**
 * Skeleton for the Settings tab.
 */
```

- [ ] **Step 2: Commit**

```bash
git add src/components/skeletons/TabSkeletons.tsx
git commit -m "docs: remove Chinese from TabSkeletons comments"
```

### Task 5.4: Fix pull-to-refresh.tsx Comments

**Files:**
- Modify: `src/components/ui/pull-to-refresh.tsx`

Current hardcoded comments:
- Line 139: `{/* 下拉指示器 */}`
- Line 154: `{/* 旋转指示器 */}`
- Line 170: `{/* 文字提示 */}`

- [ ] **Step 1: Translate comments to English**

```tsx
{/* Pull-down indicator */}
{/* Spinner indicator */}
{/* Text hint */}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/pull-to-refresh.tsx
git commit -m "docs: translate Chinese comments to English in pull-to-refresh"
```

### Task 5.5: Fix TaskQueueModal.tsx Comments

**Files:**
- Modify: `src/features/task-queue/components/TaskQueueModal.tsx`

Current hardcoded comment:
- Line 16: `* 例如: 1500 -> 1.5k, 1000000 -> 1m, 2500000000 -> 2.5b`

- [ ] **Step 1: Translate comment to English**

```typescript
/**
 * Formats numbers to compact notation (k, m, b)
 * Example: 1500 -> 1.5k, 1000000 -> 1m, 2500000000 -> 2.5b
 */
```

- [ ] **Step 2: Commit**

```bash
git add src/features/task-queue/components/TaskQueueModal.tsx
git commit -m "docs: translate Chinese comment to English"
```

---

## Chunk 6: Metadata

### Task 6.1: Fix layout.tsx Metadata

**Files:**
- Modify: `src/app/[locale]/layout.tsx`

Current hardcoded strings:
- Line 22: `title: "Cashier - AI 记账助手"`
- Line 23: `description: "AI 驱动的智能记账工具"`

- [ ] **Step 1: Make metadata use translations**

Since metadata is async and needs to use `getTranslations`, update as follows:

```typescript
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('title'),
    description: t('description'),
    // ...
  };
}
```

- [ ] **Step 2: Add Metadata namespace to translation files**

**zh.json:**
```json
{
  "Metadata": {
    "title": "Cashier - AI 记账助手",
    "description": "AI 驱动的智能记账工具"
  }
}
```

**en.json:**
```json
{
  "Metadata": {
    "title": "Cashier - AI Bookkeeping Assistant",
    "description": "AI-powered intelligent bookkeeping tool"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/layout.tsx messages/zh.json messages/en.json
git commit -m "feat(i18n): internationalize page metadata"
```

---

## Chunk 7: AI Prompts (Server-Side)

**Note:** AI prompts are in English by design for better model instruction following. However, user-facing examples should respect aiLanguage parameter.

### Task 7.1: Review stage1-prompts.ts

**Files:**
- Review: `src/features/source-document/server/tasks/stage1-prompts.ts`

Current state: Uses `${aiLanguage}` for output language. Examples in prompts use Chinese like `"其他"` but these are model instructions, not user-facing.

**Decision:** Keep as-is. Model instructions should remain in English for consistent behavior. The `aiLanguage` parameter already ensures output is in the correct language.

### Task 7.2: Review category-metadata-prompts.ts

**Files:**
- Review: `src/features/ledger/server/tasks/category-metadata-prompts.ts`

Current hardcoded strings:
- `"无描述"`
- `"无"`
- `"图标"`

- [ ] **Step 1: Use aiLanguage parameter consistently**

The prompt already uses `aiLanguage` to determine output language. The Chinese strings are for the model's context and should remain as they provide examples of existing Chinese categories.

**Decision:** Keep as-is. These are model instructions referencing existing data, not user-facing strings.

---

## Chunk 8: Testing

### Task 8.1: Run Full Test Suite

**Files:**
- All modified files

- [ ] **Step 1: Run type checking**

```bash
npm run lint
```
Expected: No TypeScript errors

- [ ] **Step 2: Run unit tests**

```bash
npm run test:run
```
Expected: All tests pass

- [ ] **Step 3: Build project**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git commit -m "test: verify all i18n changes pass tests and build"
```

---

## Summary

### Files Modified:

**Translation Files:**
- `messages/zh.json` - Add Calendar, StatsChart, Metadata namespaces
- `messages/en.json` - Add Calendar, StatsChart, Metadata namespaces

**Component Files:**
- `src/features/calendar/components/CalendarFilters.tsx`
- `src/features/calendar/components/CalendarHeatmapSection.tsx`
- `src/features/calendar/components/YearView/index.tsx`
- `src/features/calendar/components/YearView/DayCell.tsx`
- `src/features/calendar/components/MonthView.tsx`
- `src/features/calendar/components/CalendarTab.tsx`
- `src/features/calendar/components/CalendarHeader.tsx`
- `src/features/calendar/components/AdaptiveHeatmap/DayCellSmall.tsx`
- `src/features/calendar/components/AdaptiveHeatmap/DayCellLarge.tsx`
- `src/features/calendar/components/HeatmapCell.tsx`
- `src/components/stats/StatsChart.tsx`
- `src/components/ui/calendar.tsx`
- `src/components/entries/EditableLedgerEntryItem.tsx`
- `src/app/[locale]/layout.tsx`

**Comment Cleanup:**
- `src/features/source-document/components/SourceDocumentCard.tsx`
- `src/features/ledger/components/LedgerPageClient/index.tsx`
- `src/components/skeletons/TabSkeletons.tsx`
- `src/components/ui/pull-to-refresh.tsx`
- `src/features/task-queue/components/TaskQueueModal.tsx`

### Excluded (Keep As-Is):
- **Logs:** All server-side logging remains in English
- **Language names:** "中文", "English" in LanguageSwitcher
- **AI Prompts:** Model instructions remain in English with aiLanguage parameter for output
- **Test files:** Test descriptions and mock data can remain in Chinese

---

*Plan created: 2026-03-16*
*Estimated effort: 2-3 hours*
