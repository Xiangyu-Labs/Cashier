# 移除"其他"类别特殊对待 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将"其他"类别恢复为普通类别，不能分类的条目统一归入 `null`（uncategorized），取消设置页面对该类别（及 `isEditable=false` 逻辑）的特殊限制。

**Architecture:** 修改默认账本配置中的"其他"/`Other` 使 `isEditable` 为 `true`；移除 UI 层所有针对 `isEditable === false` 的视觉提示（warning badge、warning variant）和交互限制（禁止编辑/删除）；保留 AI parse 现有逻辑（`category_index = 0` 对应 `categoryId = null`）。

**Tech Stack:** Next.js 16 App Router, TypeScript, React, Tailwind CSS, next-intl, Vitest

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/config/default-ledger.ts` | 默认账本分类配置，"其他"当前 `isEditable: false` |
| `src/modules/ledger/ui/LedgerEntryCard.tsx` | 条目卡片：对 `isEditable=false` 的 category 显示 `otherCategory` badge |
| `src/modules/source-document/ui/SourceDocumentCardEntries.tsx` | 源文档卡片：对 `isEditable=false` 的 category 使用 `warning` variant |
| `src/modules/ledger/ui/CategorySection.tsx` | 设置页分类管理：根据 `isEditable` 禁用编辑和隐藏删除按钮 |
| `messages/en.json` | `otherCategory` 翻译键（"Uncategorized"） |
| `messages/zh.json` | `otherCategory` 翻译键（"未精确分类"） |
| `tests/unit/modules/ledger/ledger-entry-card-other.test.tsx` | 专门测试 `isEditable=false` badge 显示 |
| `tests/unit/modules/source-document/source-document-card-other.test.tsx` | 专门测试 `isEditable=false` warning variant |
| `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx` | 包含一个断言 warning variant 的现有测试用例 |

---

### Task 1: 将默认"其他"类别改为普通可编辑分类

**Files:**
- Modify: `src/config/default-ledger.ts:76`
- Modify: `src/config/default-ledger.ts:160`

- [ ] **Step 1: 修改 zhLedger 中"其他"的 `isEditable`**

将 `isEditable: false` 改为 `isEditable: true`。

```typescript
// 约第 71-78 行
    {
      name: "其他",
      description: "用于核算除上述预设类别以外，难以明确分类或具有特殊性质的临时性支出",
      icon: "Package",
      sortOrder: 9,
      isEditable: true, // 修改此处
    },
```

- [ ] **Step 2: 修改 enLedger 中 "Other" 的 `isEditable`**

将 `isEditable: false` 改为 `isEditable: true`。

```typescript
// 约第 154-161 行
    {
      name: "Other",
      description:
        "Miscellaneous expenses that don't fit into the predefined categories or have special/temporary nature",
      icon: "Package",
      sortOrder: 9,
      isEditable: true, // 修改此处
    },
```

- [ ] **Step 3: 运行相关测试验证配置加载正常**

Run: `npx vitest run tests/unit/ledger/application/use-cases/create-default-ledger.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/config/default-ledger.ts
git commit -m "feat: make default 'Other' category editable like regular categories"
```

---

### Task 2: 移除 LedgerEntryCard 中对非可编辑分类的特殊 badge

**Files:**
- Modify: `src/modules/ledger/ui/LedgerEntryCard.tsx`
- Delete: `tests/unit/modules/ledger/ledger-entry-card-other.test.tsx`

- [ ] **Step 1: 删除 `otherCategory` badge 渲染逻辑**

在 `src/modules/ledger/ui/LedgerEntryCard.tsx` 约第 103-121 行，删除以下整个条件渲染块：

```tsx
// 删除这段代码
                      {!ledgerEntry.category.isEditable && (
                        <Badge variant="warning" className="text-[10px] px-1 h-5">
                          {t("otherCategory")}
                        </Badge>
                      )}
```

删除后，该组件不再使用 `t("otherCategory")`，因此 `tCommon` (useTranslations("Common")) 如果仅有此用途可一并清理；但保留也无害。确保 `Badge` 的 import 若不再被使用则删除（检查是否还有其他 `Badge` 使用，如 `needsCurrency`，若有则保留 import）。

- [ ] **Step 2: 删除专属测试文件**

`tests/unit/modules/ledger/ledger-entry-card-other.test.tsx` 整个文件就是测试 `isEditable=false` 时的 badge 显示，现在该行为已不存在，直接删除。

```bash
rm tests/unit/modules/ledger/ledger-entry-card-other.test.tsx
```

- [ ] **Step 3: 运行测试套件确保无回归**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/ledger/ui/LedgerEntryCard.tsx
git add tests/unit/modules/ledger/ledger-entry-card-other.test.tsx
git commit -m "feat: remove special badge for non-editable categories in LedgerEntryCard"
```

---

### Task 3: 移除 SourceDocumentCardEntries 中对非可编辑分类的 warning variant

**Files:**
- Modify: `src/modules/source-document/ui/SourceDocumentCardEntries.tsx`
- Modify: `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
- Delete: `tests/unit/modules/source-document/source-document-card-other.test.tsx`

- [ ] **Step 1: 将所有条目 variant 统一为 default**

在 `src/modules/source-document/ui/SourceDocumentCardEntries.tsx` 约第 29 行，将：

```tsx
variant={entry.category != null && !entry.category.isEditable ? "warning" : "default"}
```

改为：

```tsx
variant="default"
```

- [ ] **Step 2: 删除专属测试文件**

`tests/unit/modules/source-document/source-document-card-other.test.tsx` 整个文件测试 warning variant 行为，现已不存在，直接删除。

```bash
rm tests/unit/modules/source-document/source-document-card-other.test.tsx
```

- [ ] **Step 3: 更新 SourceDocumentCard.test.tsx 中相关断言**

在 `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx` 约第 316-337 行，找到测试 `"keeps warning entry variants for completed cards with non-editable categories"` 并将其删除。该测试专门断言 `isEditable=false` 时会出现 warning variant 边框，而此行为已被移除。

```bash
# 或直接编辑文件删除第 316-337 行
```

- [ ] **Step 4: 运行源文档卡片相关测试**

Run: `npx vitest run tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/source-document/ui/SourceDocumentCardEntries.tsx
git add tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx
git add tests/unit/modules/source-document/source-document-card-other.test.tsx
git commit -m "feat: remove warning variant for non-editable categories in SourceDocumentCardEntries"
```

---

### Task 4: 在设置页面取消对 `isEditable` 的交互限制

**Files:**
- Modify: `src/modules/ledger/ui/CategorySection.tsx`

- [ ] **Step 1: 移除 `isEditable` 相关禁用逻辑**

在 `SortableItem` 组件中（约第 40-111 行），进行以下修改：

1. 删除 `isEditable` 变量定义：
   ```tsx
   // 删除
   const isEditable = category.isEditable === undefined || category.isEditable === true;
   ```

2. 将 `IconPicker` 的 `disabled={!isEditable}` 改为 `disabled={false}` 或直接删除 `disabled` prop。
   ```tsx
   <IconPicker
     value={category.icon}
     onChange={(icon) => onUpdateCategory(category.id, { icon })}
   />
   ```

3. 将两个 `EditableField` 的 `disabled={!isEditable}` 改为 `disabled={false}` 或直接删除 `disabled` prop。
   ```tsx
   <EditableField
     value={category.name}
     onChange={(name) => onUpdateCategory(category.id, { name })}
     displayClassName="text-sm font-medium"
     inputClassName="text-sm"
   />
   ```
   以及 description 的 `EditableField`。

4. 将删除按钮的条件渲染 `{isEditable && (...)}` 改为无条件渲染：
   ```tsx
   <div className="opacity-0 transition-opacity group-hover:opacity-100">
     <button
       onClick={onDelete}
       className="rounded p-1.5 text-[var(--muted)] transition-colors hover:bg-surface hover:text-[var(--danger)]"
     >
       <Trash2 size={15} />
     </button>
   </div>
   ```

- [ ] **Step 2: 运行 CategorySection 测试**

Run: `npx vitest run tests/unit/ledger/ui/CategorySection.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/ledger/ui/CategorySection.tsx
git commit -m "feat: remove isEditable restrictions in category management settings"
```

---

### Task 5: 清理不再使用的 i18n 翻译键

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: 从 en.json 移除 `otherCategory`**

找到 `messages/en.json` 中 `Common`（或对应命名空间）下的 `otherCategory` 键并删除。根据 grep 结果，它在 `messages/en.json:223` 附近：

```json
    "otherCategory": "Uncategorized",
```

删除该行。

- [ ] **Step 2: 从 zh.json 移除 `otherCategory`**

找到 `messages/zh.json` 中对应位置（约第 221 行）：

```json
    "otherCategory": "未精确分类",
```

删除该行。

- [ ] **Step 3: 运行完整测试套件检查 i18n 键引用是否已清空**

Run: `npx vitest run`
Expected: ALL PASS（如果某个测试还依赖该键会暴露出来）

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/zh.json
git commit -m "chore: remove unused otherCategory i18n keys"
```

---

### Task 6: 端到端回归验证

**Files:** N/A (verification only)

- [ ] **Step 1: 运行全部单元和集成测试**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: 运行 lint 检查**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: 最终确认关键文件改动清单**

确认以下文件已修改/删除：
- [ ] `src/config/default-ledger.ts` — "其他"/"Other" 的 `isEditable: true`
- [ ] `src/modules/ledger/ui/LedgerEntryCard.tsx` — 无 `otherCategory` badge
- [ ] `src/modules/source-document/ui/SourceDocumentCardEntries.tsx` — 无 `warning` variant
- [ ] `src/modules/ledger/ui/CategorySection.tsx` — 无 `isEditable` 禁用/隐藏
- [ ] `messages/en.json` / `messages/zh.json` — 无 `otherCategory`
- [ ] `tests/unit/modules/ledger/ledger-entry-card-other.test.tsx` — 已删除
- [ ] `tests/unit/modules/source-document/source-document-card-other.test.tsx` — 已删除
- [ ] `tests/unit/modules/source-document/ui/SourceDocumentCard.test.tsx` — 已移除 warning variant 断言

- [ ] **Step 4: Commit 任何 lint 自动修复**

```bash
git add -A
git commit -m "style: lint fixes" || echo "No lint changes to commit"
```

---

## Optional / 后续可考虑

- `isEditable` 字段在数据库 schema (`src/persistence/schema/ledger.ts`) 和 DTO 中仍然存在。如果后续确认完全不再需要该概念，可另起计划进行数据库迁移将其移除。当前计划保持 schema 不变，仅让 UI 不再特殊对待它。
