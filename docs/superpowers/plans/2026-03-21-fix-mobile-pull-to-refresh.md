# 修复移动端下拉刷新 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Chrome Android 上下拉刷新不触发自定义组件、被浏览器原生刷新手势拦截的问题。

**Architecture:** 根本原因是 `body` 缺少 `overscroll-behavior-y: contain`，导致 Chrome 在 `touchstart`（passive）后立即接管手势，使后续 `touchmove` 的 `e.cancelable` 为 `false`，自定义指示器无法响应。修复方法是在 `globals.css` 的 `body` 选择器中加入该 CSS 属性。

**Tech Stack:** CSS (globals.css), Vitest（测试 CSS 文件中关键属性存在）

---

## 根本原因

### 症状
用户在 Chrome Android 上向下拖动时，触发的是浏览器自带的刷新 spinner，而非 `PullToRefresh` 组件的自定义指示器。

### 调用链分析
```
src/app/[locale]/layout.tsx
  └─ <body>  ← 无 overscroll-behavior 设置
       └─ LedgerPageClient.tsx
            └─ <main className="min-h-screen ...">
                 └─ <Tabs> → <TabsContent>
                      └─ PullToRefresh (containerRef)
                           └─ addEventListener("touchstart", ..., { passive: true })
                           └─ addEventListener("touchmove",  ..., { passive: false })
```

### 为什么失效
1. `touchstart` 是 passive → 浏览器可立即启动滚动/过滚动手势
2. Chrome Android 检测到「在顶部向下拉」→ 触发原生 pull-to-refresh
3. 原生手势接管后，后续 `touchmove` 的 `event.cancelable === false`
4. 自定义组件的 `if (e.cancelable) e.preventDefault()` 无效
5. `setPullDistance` 被调用但页面已被原生动画占用，用户看不到自定义指示器

### 修复方案
在 `body` 添加 `overscroll-behavior-y: contain`：
- 保留正常垂直滚动
- 禁用浏览器原生 pull-to-refresh（overscroll 不再传递到浏览器 chrome）
- 允许容器内部的 overscroll rubber-banding（不影响体验）

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| Modify | `src/app/globals.css` | 在 `@layer base { body { ... } }` 中加入 `overscroll-behavior-y: contain` |
| Test | `tests/unit/styles/globals.test.ts` | 验证 globals.css 包含该属性 |

---

## Task 1: 写一个失败的测试，验证 globals.css 包含 overscroll-behavior-y

**Files:**
- Create: `tests/unit/styles/globals.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/unit/styles/globals.test.ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";

describe("globals.css", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");

  it("should contain overscroll-behavior-y: contain on body to prevent native pull-to-refresh interference", () => {
    expect(css).toContain("overscroll-behavior-y: contain");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/unit/styles/globals.test.ts
```

期望输出：`FAIL` - `expected string not to contain 'overscroll-behavior-y: contain'` (AssertionError)

- [ ] **Step 3: Commit 测试**

```bash
git add tests/unit/styles/globals.test.ts
git commit -m "test: add failing test for overscroll-behavior-y in globals.css"
```

---

## Task 2: 修复 globals.css

**Files:**
- Modify: `src/app/globals.css` (在 `@layer base` 的 `body` 块中)

- [ ] **Step 1: 定位当前 `@layer base { body { ... } }` 块**

查看 `src/app/globals.css` 第 228-236 行，当前内容：
```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 2: 在 body 块中添加属性**

修改后：
```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  body {
    @apply bg-background text-foreground;
    overscroll-behavior-y: contain;
  }
}
```

- [ ] **Step 3: 运行测试，确认通过**

```bash
npx vitest run tests/unit/styles/globals.test.ts
```

期望输出：`PASS`

- [ ] **Step 4: 运行全量测试，确认无回归**

```bash
npm run test:run
```

期望：所有测试通过

- [ ] **Step 5: Commit 修复**

```bash
git add src/app/globals.css
git commit -m "fix: add overscroll-behavior-y: contain to prevent native PTR from blocking custom pull-to-refresh"
```

---

## 验收标准

- [ ] `globals.css` 中 `body` 包含 `overscroll-behavior-y: contain`
- [ ] 单元测试通过
- [ ] 在 Chrome Android（或模拟器 + DevTools Touch 模拟）上，向下拉动页面显示自定义指示器而非浏览器原生圆圈
- [ ] 正常的页面纵向滚动不受影响

---

## 不在范围内（无需修改）

`PullToRefresh` 组件逻辑（触摸事件绑定、阻尼衰减、防抖）实现正确，无需改动。三个 Tab 的接入方式正确，无需改动。
