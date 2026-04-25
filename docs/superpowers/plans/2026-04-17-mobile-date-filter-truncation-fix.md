# 修复手机端日期选择器文本截断问题

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复源文档详情页中 `DateFilter` 组件在手机上因固定宽度和 `truncate` 类导致中文日期被截断为 "2026年4月1..." 的问题。

**Architecture:** 给 `DateFilter` 增加可选的 `truncate` 属性（默认 `true` 以保持现有行为兼容性），在 `SourceDocumentViewDetails` 中传入 `truncate={false}` 并同步将固定宽度 `w-[160px]` 改为 `min-w-fit`，让日期内容完整显示。

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, React Testing Library

---

## File Structure

- `src/components/ui/date-filter.tsx` — `DateFilter` 组件。增加 `truncate?: boolean` prop，条件化地应用 `truncate` 或 `whitespace-nowrap`。
- `src/modules/source-document/ui/SourceDocumentViewDetails.tsx` — 源文档详情页。将 `DateFilter` 的固定宽度改为 `min-w-fit` 并传入 `truncate={false}`。
- `tests/unit/components/ui/date-filter.test.tsx` — 新增测试。验证 `truncate` prop 能正确控制 className。

**Scope note:** 本计划仅修复 `SourceDocumentViewDetails` 中的截断问题。`QuickEntryForm` 和 `SourceDocumentInputView` 中的 `DateFilter` 使用 `w-full`，在手机上宽度足够，不在本次修复范围内。

---

## Task 1: 编写失败的测试

**Files:**
- Create: `tests/unit/components/ui/date-filter.test.tsx`

- [ ] **Step 1: 写测试**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateFilter } from "@/components/ui/date-filter";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    dateTime: (date: Date) =>
      date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
  }),
}));

describe("DateFilter", () => {
  it("applies truncate class by default", () => {
    render(<DateFilter value={new Date("2026-04-17")} onChange={() => {}} />);

    const dateText = screen.getByText("2026年4月17日");
    expect(dateText.tagName.toLowerCase()).toBe("span");
    expect(dateText).toHaveClass("truncate");
  });

  it("does not apply truncate class when truncate prop is false", () => {
    render(
      <DateFilter
        value={new Date("2026-04-17")}
        onChange={() => {}}
        truncate={false}
      />
    );

    const dateText = screen.getByText("2026年4月17日");
    expect(dateText).not.toHaveClass("truncate");
    expect(dateText).toHaveClass("whitespace-nowrap");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/components/ui/date-filter.test.tsx`

Expected: FAIL — `DateFilter` 当前没有 `truncate` prop，所以第二个测试会失败。

---

## Task 2: 修复 DateFilter 组件

**Files:**
- Modify: `src/components/ui/date-filter.tsx`

- [ ] **Step 3: 添加 truncate prop 并条件化 className**

修改 `src/components/ui/date-filter.tsx`：

1. 在 `DateFilterProps` 中增加 `truncate?: boolean`
2. 在组件参数解构中增加 `truncate = true`
3. 将 span 的 `className="truncate flex-1"` 改为条件渲染

具体代码变更如下（以实际文件为准）：

```tsx
interface DateFilterProps {
  /** Selected date */
  value?: Date | string | null;
  /** Callback when date changes */
  onChange: (date: Date | null) => void;
  className?: string;
  /** Placeholder text when no date selected */
  placeholder?: string;
  /** Size variant */
  size?: "sm" | "default";
  /** Show clear button when date is selected */
  showClear?: boolean;
  /** Whether to truncate overflow text with ellipsis */
  truncate?: boolean;
}

export function DateFilter({
  value,
  onChange,
  className,
  placeholder,
  size = "default",
  showClear = true,
  truncate = true,
}: DateFilterProps) {
```

然后在 JSX 中的 span：

```tsx
<span className={cn(truncate ? "truncate" : "whitespace-nowrap", "flex-1")}>
```

- [ ] **Step 4: 验证 DateFilter 文件无 TypeScript 错误**

Run: `npx tsc --noEmit`

Expected: 无 `date-filter.tsx` 相关错误

---

## Task 3: 修复 SourceDocumentViewDetails

**Files:**
- Modify: `src/modules/source-document/ui/SourceDocumentViewDetails.tsx:161-170`

- [ ] **Step 5: 修改 DateFilter 调用**

将：

```tsx
<DateFilter
  value={displayEntryDate}
  onChange={(date) => {
    if (date) {
      onSourceDocChange({ entryDate: formatDateTimeForApi(date) });
    }
  }}
  size="sm"
  className="h-8 w-[160px] shrink-0"
/>
```

改为：

```tsx
<DateFilter
  value={displayEntryDate}
  onChange={(date) => {
    if (date) {
      onSourceDocChange({ entryDate: formatDateTimeForApi(date) });
    }
  }}
  size="sm"
  className="h-8 min-w-fit shrink-0"
  truncate={false}
/>
```

---

## Task 4: 验证测试通过

- [ ] **Step 6: 运行新测试**

Run: `npx vitest run tests/unit/components/ui/date-filter.test.tsx`

Expected: PASS

- [ ] **Step 7: 运行 SourceDocument 相关测试确保没有回归**

Run: `npx vitest run tests/unit/modules/source-document/ui/SourceDocumentDetailModal.test.tsx`

Expected: PASS

---

## Task 5: 提交

- [ ] **Step 8: Commit**

```bash
git add tests/unit/components/ui/date-filter.test.tsx src/components/ui/date-filter.tsx src/modules/source-document/ui/SourceDocumentViewDetails.tsx
git commit -m "fix: prevent mobile date filter from truncating Chinese dates

- Add optional truncate prop to DateFilter (default true for backward compatibility)
- Disable truncation and use min-w-fit in SourceDocumentViewDetails"
```
