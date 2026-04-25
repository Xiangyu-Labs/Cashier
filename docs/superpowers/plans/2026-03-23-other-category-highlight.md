# "其他"分类高亮 & AI Prompt 强化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在流水和明细两个 Tab 中，将归类为「其他」的条目视为异常状态并高亮显示，同时强化 AI Prompt 使其将「其他」作为最后手段。

**Architecture:**
- 「其他」分类通过 `isEditable: false` 在 DB 中唯一标识，系统默认分类无法被用户删除。判断一个条目是否属于「其他」= `category.isEditable === false`。
- 流水 Tab：`LedgerEntryItem` 已有 `variant="warning"` 样式但从未被用；需在 `SourceDocumentCard` 中为「其他」条目传 `variant="warning"`。
- 明细 Tab：`LedgerEntryCard` 的 category 非 null 分支内显示分类名称；需在该分支内插入「其他」warning badge。（注意：`needsCategory` badge 那段代码是废弃死代码，不要参考或依赖它。）
- AI Prompt：stage1 的 `buildCategoryRecognitionPrompt` 和 stage2 的 `buildDetailedParsePrompt` 需要强化「其他」为最后手段的指令。

**Tech Stack:** React, TypeScript, class-variance-authority (cva), next-intl (i18n), Vitest

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/modules/source-document/application/parse-source-document/stage1-prompts.ts` | Modify | 强化 category recognition rule |
| `src/modules/source-document/application/parse-source-document/stage2-prompts.ts` | Modify | 强化 category_index 分配规则 |
| `src/modules/source-document/ui/SourceDocumentCard.tsx` | Modify | 为「其他」条目传 `variant="warning"` |
| `src/modules/ledger/ui/LedgerEntryCard.tsx` | Modify | 为「其他」分类显示 warning badge |
| `messages/zh.json` | Modify | 新增 `otherCategory` 翻译 key |
| `messages/en.json` | Modify | 新增 `otherCategory` 翻译 key |
| `tests/unit/modules/source-document/stage-prompts.test.ts` | Create | 验证 prompt 包含 last-resort 规则 |
| `tests/unit/modules/ledger/ledger-entry-card-other.test.ts` | Create | 验证「其他」状态的 badge 显示 |

---

## Task 1: 强化 Stage1 Prompt — 「其他」为最后手段

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/stage1-prompts.ts:114-117`
- Test: `tests/unit/modules/source-document/stage-prompts.test.ts`

- [ ] **Step 1: 新建测试文件，写失败测试**

```typescript
// tests/unit/modules/source-document/stage-prompts.test.ts
import { describe, it, expect } from "vitest";
import { buildCategoryRecognitionPrompt } from "@/modules/source-document/application/parse-source-document/stage1-prompts";

describe("buildCategoryRecognitionPrompt", () => {
  it("should instruct AI to use Other only as last resort", () => {
    const prompt = buildCategoryRecognitionPrompt("zh-CN", [
      { name: "餐饮", description: null },
      { name: "其他", description: null },
    ]);
    expect(prompt).toMatch(/last.?resort|最后手段|万不得已|only if.*no.*categor/i);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/modules/source-document/stage-prompts.test.ts
```

Expected: FAIL — prompt 目前没有 last resort 措辞

- [ ] **Step 3: 修改 stage1-prompts.ts，将 rule 2 改为 last-resort 措辞**

将 `stage1-prompts.ts` 中 `buildCategoryRecognitionPrompt` 的规则：
```
2. If items cannot be categorized, use "其他" (Other)
```
改为：
```
2. Only use "其他" (Other) as a LAST RESORT — only when the item truly does not fit ANY other available category. If there is any reasonable fit, prefer that category over "其他".
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/unit/modules/source-document/stage-prompts.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/stage1-prompts.ts tests/unit/modules/source-document/stage-prompts.test.ts
git commit -m "feat: strengthen 'Other' category as last resort in stage1 prompt"
```

---

## Task 2: 强化 Stage2 Prompt — category_index 的「其他」规则

**Files:**
- Modify: `src/modules/source-document/application/parse-source-document/stage2-prompts.ts:77`
- Test: `tests/unit/modules/source-document/stage-prompts.test.ts` (追加)

- [ ] **Step 1: 追加失败测试**

```typescript
import { buildDetailedParsePrompt } from "@/modules/source-document/application/parse-source-document/stage2-prompts";
import type { ValidationSummary } from "@/modules/source-document/application/parse-source-document/types";

describe("buildDetailedParsePrompt", () => {
  it("should instruct AI to assign 'Other' category index only as last resort", () => {
    const summary: ValidationSummary = {
      summary: { title: "Test", currencies: [], rules: [] },
      isValid: true,
    };
    const categories = [
      { name: "餐饮", description: null },
      { name: "其他", description: null },
    ];
    const prompt = buildDetailedParsePrompt(summary, categories);
    expect(prompt).toMatch(/last.?resort|最后手段|万不得已|only if.*no.*categor/i);
  });
});
```
- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/modules/source-document/stage-prompts.test.ts
```

Expected: FAIL

- [ ] **Step 3: 修改 stage2-prompts.ts，在 Rule 3 后追加说明**

将 `stage2-prompts.ts` 中的规则：
```
3. Assign category_index from the pre-identified list (use 0 if no category fits)
```
改为：
```
3. Assign category_index from the pre-identified list. If the item truly cannot fit any specific category but a "其他" (Other) category exists in the list, assign its index — do NOT use 0. Reserve category_index 0 ONLY for when the category list is completely empty. "其他"/"Other" should be used as a last resort; always prefer any reasonable specific category match over it.
```

> **关键原因**：`category_index: 0` 在系统中表示 `categoryId = null`（未分类），会触发 `needsCategory` badge，而不是「其他」高亮。只要 category list 中有「其他」，就必须用它的真实 index，否则高亮逻辑完全被绕过。

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/unit/modules/source-document/stage-prompts.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/application/parse-source-document/stage2-prompts.ts tests/unit/modules/source-document/stage-prompts.test.ts
git commit -m "feat: strengthen 'Other' category as last resort in stage2 prompt"
```

---

## Task 3: 翻译文件 — 新增「其他分类」的 warning badge 文案

**Files:**
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

> 规范：badge 文案添加在 `Common` namespace 下，与 `needsCategory`、`needsCurrency` 同级。

- [ ] **Step 1: 在 `messages/zh.json` 的 `Common` 节点中追加**

找到 `"needsCategory"` 所在位置，在其后添加：
```json
"otherCategory": "未精确分类"
```

- [ ] **Step 2: 在 `messages/en.json` 的 `Common` 节点中追加**

```json
"otherCategory": "Uncategorized"
```

- [ ] **Step 3: Commit**

```bash
git add messages/zh.json messages/en.json
git commit -m "i18n: add otherCategory warning badge translation"
```

---

## Task 4: 明细 Tab — LedgerEntryCard 高亮「其他」分类

**Files:**
- Modify: `src/modules/ledger/ui/LedgerEntryCard.tsx`
- Test: `tests/unit/modules/ledger/ledger-entry-card-other.test.ts` (新建)

背景：`LedgerEntryCard` 中已有 `category` 为 null 时显示 `needsCategory` badge 的逻辑（第 116-127 行）。需要在 `category` 不为 null 但 `isEditable === false`（即「其他」分类）时，也显示 warning badge。

- [ ] **Step 1: 新建测试文件，写失败测试**

```typescript
// tests/unit/modules/ledger/ledger-entry-card-other.test.ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LedgerEntryCard } from "@/modules/ledger/ui/LedgerEntryCard";
import type { LedgerEntry, EntryCategory } from "@/modules/ledger/contracts";

const otherCategory: EntryCategory = {
  id: "cat-other",
  ledgerId: "ledger-1",
  name: "其他",
  description: null,
  icon: "Package",
  sortOrder: 9,
  isEditable: false,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

const mockEntry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-1",
  categoryId: "cat-other",
  category: otherCategory,
  itemName: "神秘支出",
  amount: "100.00",
  currency: "CNY",
  convertedAmount: null,
  exchangeRate: null,
  description: null,
  sourceDocumentId: null,
  sourceDocument: null,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

describe("LedgerEntryCard - other category", () => {
  it("shows warning badge when category is non-editable (Other)", () => {
    render(
      <LedgerEntryCard
        ledgerEntry={mockEntry}
        categories={[otherCategory]}
        mainCurrency="CNY"
      />
    );
    expect(screen.getByText("未精确分类")).toBeInTheDocument();
  });

  it("does NOT show warning badge for normal categorized entries", () => {
    const normalCategory: EntryCategory = { ...otherCategory, id: "cat-food", name: "餐饮", isEditable: true };
    const normalEntry: LedgerEntry = { ...mockEntry, categoryId: "cat-food", category: normalCategory };
    render(
      <LedgerEntryCard
        ledgerEntry={normalEntry}
        categories={[normalCategory]}
        mainCurrency="CNY"
      />
    );
    expect(screen.queryByText("未精确分类")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/modules/ledger/ledger-entry-card-other.test.ts
```

Expected: FAIL — 目前没有「其他」badge 逻辑

- [ ] **Step 3: 修改 LedgerEntryCard.tsx**

在 `category` 不为 null 的分支内，紧接在 category icon/name 渲染之后，在 category name 旁边插入条件 badge：

```tsx
{ledgerEntry.category != null && !ledgerEntry.category.isEditable && (
  <Badge variant="warning" className="text-[10px] px-1 h-5">
    {t("otherCategory")}
  </Badge>
)}
```

具体位置：在 `category != null` 分支内（line 105-115），找到显示 category name 的 `<span>` 同级，在其后插入。注意：`needsCategory` badge（line 116-127）是废弃死代码，不要参考它。

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/unit/modules/ledger/ledger-entry-card-other.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ledger/ui/LedgerEntryCard.tsx tests/unit/modules/ledger/ledger-entry-card-other.test.ts
git commit -m "feat: show warning badge on LedgerEntryCard when category is Other"
```

---

## Task 5: 流水 Tab — SourceDocumentCard 为「其他」条目的 LedgerEntryItem 传 warning variant

**Files:**
- Modify: `src/modules/source-document/ui/SourceDocumentCard.tsx`
- Test: `tests/unit/modules/source-document/source-document-card-other.test.ts` (新建)

背景：`LedgerEntryItem` 已具备 `variant="warning"` 样式（`bg-warning/5 border border-warning/20`），但 `SourceDocumentCard` 渲染条目时始终传 `variant="default"`。需改为：当该条目的 `category.isEditable === false` 时传 `variant="warning"`。

- [ ] **Step 1: 新建测试文件，写失败测试**

```typescript
// tests/unit/modules/source-document/source-document-card-other.test.ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceDocumentCard } from "@/modules/source-document/ui/SourceDocumentCard";
import type { LedgerEntry, EntryCategory } from "@/modules/ledger/contracts";
import type { SourceDocument } from "@/modules/source-document/contracts";

const otherCategory: EntryCategory = {
  id: "cat-other",
  ledgerId: "ledger-1",
  name: "其他",
  description: null,
  icon: "Package",
  sortOrder: 9,
  isEditable: false,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

const mockEntry: LedgerEntry = {
  id: "entry-1",
  ledgerId: "ledger-1",
  categoryId: "cat-other",
  category: otherCategory,
  itemName: "神秘支出",
  amount: "100.00",
  currency: "CNY",
  convertedAmount: null,
  exchangeRate: null,
  description: null,
  sourceDocumentId: "doc-1",
  sourceDocument: null,
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
};

const mockSourceDocument: SourceDocument = {
  id: "doc-1",
  ledgerId: "ledger-1",
  title: "测试单据",
  text: null,
  imageUrls: [],
  status: "completed",
  type: "text",
  anomalyReason: null,
  entryDate: "2024-01-01",
  metadata: {},
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  deletedAt: null,
  hasImages: false,
};

describe("SourceDocumentCard - other category entry", () => {
  it("renders LedgerEntryItem with warning variant when entry category isEditable=false", () => {
    const { container } = render(
      <SourceDocumentCard
        sourceDocument={mockSourceDocument}
        ledgerEntries={[mockEntry]}
        categories={[otherCategory]}
        mainCurrency="CNY"
        status="completed"
        anomalyReason={null}
        defaultExpanded
      />
    );
    // warning variant applies bg-warning/5 and border-warning/20
    const warningEl = container.querySelector(".border-warning\/20");
    expect(warningEl).not.toBeNull();
  });

  it("does NOT render warning variant for normal categorized entry", () => {
    const normalCategory: EntryCategory = { ...otherCategory, id: "cat-food", name: "餐饮", isEditable: true };
    const normalEntry: LedgerEntry = { ...mockEntry, categoryId: "cat-food", category: normalCategory };
    const { container } = render(
      <SourceDocumentCard
        sourceDocument={mockSourceDocument}
        ledgerEntries={[normalEntry]}
        categories={[normalCategory]}
        mainCurrency="CNY"
        status="completed"
        anomalyReason={null}
        defaultExpanded
      />
    );
    const warningEl = container.querySelector(".border-warning\/20");
    expect(warningEl).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/unit/modules/source-document/source-document-card-other.test.ts
```

Expected: FAIL — 当前始终传 `variant="default"`

- [ ] **Step 3: 修改 SourceDocumentCard.tsx 中的 LedgerEntryItem 渲染**

找到渲染 `sortedEntries` 的区域（`status === "completed"` 分支内），将：
```tsx
<LedgerEntryItem
  key={entry.id}
  ledgerEntry={entry}
  onView={() => onViewLedgerEntry?.(entry)}
  mainCurrency={mainCurrency}
  sourceDocumentEntryDate={sourceDocument.entryDate}
  variant="default"
/>
```
改为：
```tsx
<LedgerEntryItem
  key={entry.id}
  ledgerEntry={entry}
  onView={() => onViewLedgerEntry?.(entry)}
  mainCurrency={mainCurrency}
  sourceDocumentEntryDate={sourceDocument.entryDate}
  variant={entry.category != null && !entry.category.isEditable ? "warning" : "default"}
/>
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/unit/modules/source-document/source-document-card-other.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/ui/SourceDocumentCard.tsx tests/unit/modules/source-document/source-document-card-other.test.ts
git commit -m "feat: highlight Other-category entries with warning variant in stream tab"
```

---

## Task 6: 清理 `needsCategory` 死代码

**背景：** `needsCategory` badge（`LedgerEntryCard.tsx` lines 116-127）是废弃的死代码，对应翻译 key 也已无用。Task 4 新增「其他」badge 后，顺手将其一起清除。

**Files:**
- Modify: `src/modules/ledger/ui/LedgerEntryCard.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

- [ ] **Step 1: 删除 LedgerEntryCard.tsx 中的 `needsCategory` 分支**

将 `category` 的三元表达式 `? ... : <needsCategory badge>` 改为只保留有 category 的分支：

```tsx
// 改前（lines 104-127）：
{ledgerEntry.category ? (
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
    ...
  </div>
) : (
  <div className="flex items-center gap-2">
    <Badge variant="warning" className="text-[10px] px-1 h-5">
      {t("needsCategory")}
    </Badge>
    ...
  </div>
)}

// 改后：
{ledgerEntry.category && (
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 flex-1">
    ...
  </div>
)}
```

- [ ] **Step 2: 删除翻译 key**

`messages/zh.json`：删除 `"needsCategory": "需要分类",`

`messages/en.json`：删除 `"needsCategory": "Needs Category",`

- [ ] **Step 3: 确认无残留引用**

```bash
grep -rn 'needsCategory' src/ messages/
```

Expected: 无输出

- [ ] **Step 4: 运行现有测试确认无回归**

```bash
npx vitest run tests/unit/modules/ledger/
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ledger/ui/LedgerEntryCard.tsx messages/zh.json messages/en.json
git commit -m "chore: remove needsCategory dead code and unused translation keys"
```

---

## 执行顺序

Task 1 → Task 2 → Task 3 → Task 4 → Task 6 → Task 5

> Task 3（翻译文件）必须在 Task 4（LedgerEntryCard badge）之前执行，因为 Task 4 的 `t("otherCategory")` 翻译 key 依赖 Task 3 中新增的翻译条目。Task 6（死代码清理）在 Task 4 之后执行，方便在同一区域的改动完成后一次性清理。Task 5（SourceDocumentCard variant）不依赖翻译，可在最后执行。
