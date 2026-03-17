# z-index 统一实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目中分散的 `z-50`、`z-10` 等 magic number 替换为语义化的 z-index 名称，提升可维护性。

**Architecture:** 在 Tailwind CSS v4 的 `@theme` 块中定义语义化 z-index 值（`z-header`、`z-tooltip`、`z-modal`、`z-toast`），然后批量替换现有组件中的使用。保持层级关系：tooltip (40) < header (50) < modal overlay (100) < modal content (200) < toast (300)。

**Tech Stack:** Tailwind CSS v4, React, TypeScript

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/app/globals.css` | 修改 | 在 `@theme` 块中添加语义化 z-index 配置 |
| `src/features/calendar/components/YearView/DayCell.tsx` | 修改 | `z-50` → `z-tooltip` |
| `src/features/calendar/components/AdaptiveHeatmap/DayCellLarge.tsx` | 修改 | `z-50` → `z-tooltip` |
| `src/features/source-document/components/SourceDocumentDetailModal.tsx` | 修改 | `z-50` → `z-modal-footer` |
| `src/features/ledger/components/LedgerPageClient/Header.tsx` | 修改 | `z-50` → `z-header` |
| `src/components/stats/StatsChart.tsx` | 修改 | `z-50` → `z-tooltip` |
| `src/components/ui/image-viewer.tsx` | 修改 | `z-50` → `z-modal-control`, `z-10` → `z-modal-thumb` |
| `src/components/skeletons/SettingsSkeleton.tsx` | 修改 | `z-50` → `z-header` |
| `src/components/skeletons/LedgerPageSkeleton.tsx` | 修改 | `z-50` → `z-header` |
| `src/components/batch-action-toolbar/index.tsx` | 修改 | `z-50` → `z-action-bar` |

---

## Chunk 1: 添加 Tailwind 主题配置

### Task 1: 在 globals.css 中添加语义化 z-index 配置

**Files:**
- Modify: `src/app/globals.css:6-29` (在 `@theme` 块中添加)

- [ ] **Step 1: 打开 globals.css 并定位 @theme 块**

找到第 6-29 行的 `@theme` 块，准备添加 z-index 配置。

- [ ] **Step 2: 添加 z-index 主题配置**

在 `@theme` 块中添加以下内容（放在颜色变量之后，shadow 变量之前）：

```css
@theme {
  --color-primary: var(--primary);
  /* ... 其他颜色变量 ... */

  /* z-index 层级 */
  --z-tooltip: 40;
  --z-header: 50;
  --z-action-bar: 60;
  --z-modal-overlay: 100;
  --z-modal: 200;
  --z-modal-control: 210;
  --z-modal-footer: 220;
  --z-toast: 300;

  --shadow-modal: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  /* ... 其他变量 ... */
}
```

层级说明：
- `z-tooltip` (40): 悬浮提示，低于 header
- `z-header` (50): 置顶导航
- `z-action-bar` (60): 底部批量操作栏，略高于 header
- `z-modal-overlay` (100): 模态框遮罩
- `z-modal` (200): 模态框内容
- `z-modal-control` (210): 模态框内控制按钮
- `z-modal-footer` (220): 模态框底部操作栏
- `z-toast` (300): 通知提示，最高层级

- [ ] **Step 3: 验证配置语法**

运行开发服务器确认配置无语法错误：
```bash
npm run dev
```
Expected: 服务器正常启动，无 CSS 解析错误

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): add semantic z-index tokens to Tailwind theme"
```

---

## Chunk 2: 替换 Header 组件

### Task 2: 替换 Ledger Header 的 z-index

**Files:**
- Modify: `src/features/ledger/components/LedgerPageClient/Header.tsx:36`

- [ ] **Step 1: 修改 Header.tsx**

将第 36 行：
```tsx
<header className="bg-surface border-b border-border sticky top-0 z-50 backdrop-blur-md ...">
```

改为：
```tsx
<header className="bg-surface border-b border-border sticky top-0 z-header backdrop-blur-md ...">
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ledger/components/LedgerPageClient/Header.tsx
git commit -m "refactor(header): use semantic z-header instead of z-50"
```

### Task 3: 替换 Settings Skeleton 的 z-index

**Files:**
- Modify: `src/components/skeletons/SettingsSkeleton.tsx:9`

- [ ] **Step 1: 修改 SettingsSkeleton.tsx**

将第 9 行：
```tsx
<header className="bg-surface border-b border-border sticky top-0 z-50">
```

改为：
```tsx
<header className="bg-surface border-b border-border sticky top-0 z-header">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/skeletons/SettingsSkeleton.tsx
git commit -m "refactor(skeleton): use semantic z-header in SettingsSkeleton"
```

### Task 4: 替换 Ledger Page Skeleton 的 z-index

**Files:**
- Modify: `src/components/skeletons/LedgerPageSkeleton.tsx:9`

- [ ] **Step 1: 修改 LedgerPageSkeleton.tsx**

将第 9 行：
```tsx
<header className="bg-surface border-b border-border sticky top-0 z-50">
```

改为：
```tsx
<header className="bg-surface border-b border-border sticky top-0 z-header">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/skeletons/LedgerPageSkeleton.tsx
git commit -m "refactor(skeleton): use semantic z-header in LedgerPageSkeleton"
```

---

## Chunk 3: 替换 Tooltip 组件

### Task 5: 替换 Calendar DayCell Tooltip

**Files:**
- Modify: `src/features/calendar/components/YearView/DayCell.tsx:50`

- [ ] **Step 1: 修改 DayCell.tsx**

将第 50 行的 tooltip div：
```tsx
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
```

改为：
```tsx
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-tooltip pointer-events-none">
```

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/YearView/DayCell.tsx
git commit -m "refactor(calendar): use semantic z-tooltip in DayCell"
```

### Task 6: 替换 AdaptiveHeatmap DayCellLarge Tooltip

**Files:**
- Modify: `src/features/calendar/components/AdaptiveHeatmap/DayCellLarge.tsx:66`

- [ ] **Step 1: 修改 DayCellLarge.tsx**

将第 66 行的 tooltip div：
```tsx
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
```

改为：
```tsx
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-tooltip pointer-events-none">
```

- [ ] **Step 2: Commit**

```bash
git add src/features/calendar/components/AdaptiveHeatmap/DayCellLarge.tsx
git commit -m "refactor(calendar): use semantic z-tooltip in DayCellLarge"
```

### Task 7: 替换 StatsChart Tooltip

**Files:**
- Modify: `src/components/stats/StatsChart.tsx:252`

- [ ] **Step 1: 修改 StatsChart.tsx**

将第 252 行的 tooltip div：
```tsx
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-50 pointer-events-none">
```

改为：
```tsx
<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-tooltip pointer-events-none">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/stats/StatsChart.tsx
git commit -m "refactor(stats): use semantic z-tooltip in StatsChart"
```

---

## Chunk 4: 替换 Modal 相关组件

### Task 8: 替换 SourceDocumentDetailModal Footer

**Files:**
- Modify: `src/features/source-document/components/SourceDocumentDetailModal.tsx:300`

- [ ] **Step 1: 修改 SourceDocumentDetailModal.tsx**

将第 300 行的 footer div：
```tsx
<div className="shrink-0 px-4 py-3 border-t bg-surface/80 backdrop-blur-md sm:bg-surface2/30 flex justify-between items-center gap-2 z-50">
```

改为：
```tsx
<div className="shrink-0 px-4 py-3 border-t bg-surface/80 backdrop-blur-md sm:bg-surface2/30 flex justify-between items-center gap-2 z-modal-footer">
```

- [ ] **Step 2: Commit**

```bash
git add src/features/source-document/components/SourceDocumentDetailModal.tsx
git commit -m "refactor(modal): use semantic z-modal-footer in SourceDocumentDetailModal"
```

### Task 9: 替换 ImageViewer 控制按钮

**Files:**
- Modify: `src/components/ui/image-viewer.tsx:111`, `src/components/ui/image-viewer.tsx:219`, `src/components/ui/image-viewer.tsx:228`, `src/components/ui/image-viewer.tsx:236`

- [ ] **Step 1: 修改顶部控制栏（第 111 行）**

将：
```tsx
<div className="absolute top-4 right-4 z-50 flex items-center gap-2 pointer-events-auto">
```

改为：
```tsx
<div className="absolute top-4 right-4 z-modal-control flex items-center gap-2 pointer-events-auto">
```

- [ ] **Step 2: 修改左箭头按钮（第 219 行）**

将：
```tsx
className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-16 w-16 hidden sm:flex z-50"
```

改为：
```tsx
className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-16 w-16 hidden sm:flex z-modal-control"
```

- [ ] **Step 3: 修改右箭头按钮（第 228 行）**

将：
```tsx
className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-16 w-16 hidden sm:flex z-50"
```

改为：
```tsx
className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white hover:bg-white/10 h-16 w-16 hidden sm:flex z-modal-control"
```

- [ ] **Step 4: 修改缩略图栏（第 236 行）**

将：
```tsx
<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] p-2 bg-black/50 backdrop-blur-sm rounded-full z-10 pointer-events-auto">
```

改为：
```tsx
<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 overflow-x-auto max-w-[80vw] p-2 bg-black/50 backdrop-blur-sm rounded-full z-modal-thumb pointer-events-auto">
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/image-viewer.tsx
git commit -m "refactor(image-viewer): use semantic z-modal-control and z-modal-thumb"
```

---

## Chunk 5: 替换 Batch Action Toolbar

### Task 10: 替换 BatchActionToolbar

**Files:**
- Modify: `src/components/batch-action-toolbar/index.tsx:114`

- [ ] **Step 1: 修改 batch-action-toolbar/index.tsx**

将第 114 行：
```tsx
? "fixed bottom-0 left-0 right-0 z-50 px-2 sm:px-4 pb-2 sm:pb-4 pointer-events-none"
```

改为：
```tsx
? "fixed bottom-0 left-0 right-0 z-action-bar px-2 sm:px-4 pb-2 sm:pb-4 pointer-events-none"
```

- [ ] **Step 2: Commit**

```bash
git add src/components/batch-action-toolbar/index.tsx
git commit -m "refactor(toolbar): use semantic z-action-bar in BatchActionToolbar"
```

---

## Chunk 6: 验证和清理

### Task 11: 验证所有替换完成

- [ ] **Step 1: 搜索未替换的 z-index 使用**

```bash
grep -r "z-50\|z-10" --include="*.tsx" --include="*.ts" --include="*.css" src/ | grep -v "z-header\|z-tooltip\|z-modal\|z-action-bar"
```
Expected: 无输出（所有旧用法已替换）

- [ ] **Step 2: 运行 lint 检查**

```bash
npm run lint
```
Expected: 无错误

- [ ] **Step 3: 运行开发服务器验证 UI**

```bash
npm run dev
```
Expected: 服务器正常启动，header、tooltip、modal 等层级表现正常

- [ ] **Step 4: 运行测试**

```bash
npm run test:run
```
Expected: 所有测试通过

### Task 12: 可选 - 清理未使用的 CSS 变量

**Files:**
- Modify: `src/app/globals.css:62-65`

- [ ] **Step 1: 检查 CSS 变量是否在其他地方使用**

```bash
grep -r "var(--z-base)\|var(--z-dropdown)\|var(--z-modal)\|var(--z-toast)" --include="*.css" --include="*.tsx" --include="*.ts" src/
```

如果没有任何使用（除了定义本身），可以删除这些变量。

- [ ] **Step 2: 删除未使用的 CSS 变量（如果需要）**

在 `globals.css` 第 62-65 行，删除：
```css
--z-base: 0;
--z-dropdown: 1000;
--z-modal: 2000;
--z-toast: 3000;
```

注意：`docs/architecture/UI.md` 文档中引用了这些变量，需要同步更新文档。

- [ ] **Step 3: Commit（如果执行了清理）**

```bash
git add src/app/globals.css
git commit -m "chore(css): remove unused z-index CSS variables (replaced by Tailwind theme)"
```

---

## 完成检查清单

- [ ] 所有 `z-50` 替换为语义化名称
- [ ] 所有 `z-10` 替换为语义化名称
- [ ] `globals.css` 中添加了 `@theme` z-index 配置
- [ ] lint 检查通过
- [ ] 开发服务器正常运行
- [ ] 测试通过
- [ ] 所有修改已提交

---

## 回滚指南

如果需要回滚，可以执行：
```bash
git log --oneline -20  # 查看最近的提交
git revert <commit-hash>...<commit-hash>  # 批量 revert
```
