# 修复移动端下拉刷新回调不触发 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 iOS Safari 上下拉刷新指示器能显示但 `onRefresh` 从不被调用的 bug。

**Architecture:** 根本原因是 `StatsTab` 和 `DetailsTab` 的 `handleRefresh` 没有用 `useCallback`，每次 render 产生新引用，导致 `PullToRefresh` 的 `useEffect`（依赖 `onRefresh`）在 `touchmove` 期间重新注册监听器，iOS Safari 不向手势中途新注册的监听器投递 `touchend`。核心修复：在 `PullToRefresh` 内用 ref 持有最新 `onRefresh`，从 `useEffect` deps 移除它；同时在两个 Tab 补上 `useCallback`。

**Tech Stack:** React (useRef, useCallback), Vitest + jsdom

---

## 根本原因

```
用户手指下拉
  → touchmove → setPullDistance()             ← 触发 re-render
  → StatsTab/DetailsTab re-render
  → handleRefresh 重新创建（无 useCallback）   ← onRefresh 是新引用
  → PullToRefresh useEffect deps [onRefresh] 变化
  → cleanup: removeEventListener("touchend", oldHandler)
  → setup:   addEventListener("touchend", newHandler)  ← 手势进行中
  → 用户松手 → iOS Safari 不向手势中途注册的监听器投递 touchend
  → onRefresh 永远不被调用
```

受影响文件：
- `src/components/ui/pull-to-refresh.tsx:126` — useEffect deps 含 onRefresh
- `src/modules/workspace/ui/StatsTab.tsx:96` — handleRefresh 无 useCallback
- `src/modules/workspace/ui/DetailsTab.tsx:128` — handleRefresh 无 useCallback
- `src/modules/workspace/ui/LedgerEntriesTab.tsx:101` — ✅ 已正确使用 useCallback

---

## 文件变更清单

| 操作 | 文件 |
|------|------|
| Create | `tests/unit/components/pull-to-refresh.test.tsx` |
| Modify | `src/components/ui/pull-to-refresh.tsx` |
| Modify | `src/modules/workspace/ui/StatsTab.tsx` |
| Modify | `src/modules/workspace/ui/DetailsTab.tsx` |

---

## Task 1：写复现 bug 的失败测试

**Files:**
- Create: `tests/unit/components/pull-to-refresh.test.tsx`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/unit/components/pull-to-refresh.test.tsx
import { render, act } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

Object.defineProperty(window, "ontouchstart", { value: () => {}, writable: true, configurable: true });

function fireTouchEvent(element: Element, type: string, clientY: number) {
  element.dispatchEvent(
    new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches:
        type === "touchend"
          ? []
          : ([{ clientY, clientX: 0, identifier: 0, target: element }] as unknown as TouchList),
      changedTouches: [{ clientY, clientX: 0, identifier: 0, target: element }] as unknown as TouchList,
    })
  );
}

describe("PullToRefresh", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  });

  it("calls onRefresh even when onRefresh reference changes during touchmove", async () => {
    const onRefreshV1 = vi.fn().mockResolvedValue(undefined);
    const onRefreshV2 = vi.fn().mockResolvedValue(undefined);

    function Parent() {
      const [fn, setFn] = useState<() => Promise<void>>(() => onRefreshV1);
      return (
        <>
          <button data-testid="swap" onClick={() => setFn(() => onRefreshV2)} />
          <PullToRefresh onRefresh={fn} className="ptr-root">
            <div style={{ height: "500px" }}>content</div>
          </PullToRefresh>
        </>
      );
    }

    const { container, getByTestId } = render(<Parent />);
    const ptrEl = container.querySelector(".ptr-root") as Element;

    // 1. touchstart at top
    act(() => fireTouchEvent(ptrEl, "touchstart", 50));
    // 2. first touchmove — triggers setPullDistance → re-render
    act(() => fireTouchEvent(ptrEl, "touchmove", 100));
    // 3. simulate parent re-render changing onRefresh reference
    act(() => getByTestId("swap").click());
    // 4. pull past threshold: distance=200, damped=min(200*0.5,80)=80 > threshold=60
    act(() => fireTouchEvent(ptrEl, "touchmove", 250));
    // 5. release
    await act(async () => fireTouchEvent(ptrEl, "touchend", 250));

    const totalCalls = onRefreshV1.mock.calls.length + onRefreshV2.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/unit/components/pull-to-refresh.test.tsx
```

期望：`FAIL` — `expected 0 to be greater than 0`

- [ ] **Step 3: Commit**

```bash
git add tests/unit/components/pull-to-refresh.test.tsx
git commit -m "test: add failing test for PTR onRefresh stability across re-renders"
```

---

## Task 2：修复 PullToRefresh 组件（核心修复）

**Files:**
- Modify: `src/components/ui/pull-to-refresh.tsx`

- [ ] **Step 1: 在 pullDistanceRef 声明后添加 onRefreshRef（约第 29 行）**

找到：
```typescript
  const pullDistanceRef = useRef(0);
```

改为：
```typescript
  const pullDistanceRef = useRef(0);
  // Always holds the latest onRefresh. Kept out of useEffect deps to prevent
  // re-registering touch listeners mid-gesture (iOS drops touchend on new listeners).
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
```

- [ ] **Step 2: 在 handleTouchEnd 中改用 onRefreshRef（约第 101 行）**

找到：
```typescript
          await onRefresh();
```

改为：
```typescript
          await onRefreshRef.current();
```

- [ ] **Step 3: 从 useEffect deps 移除 onRefresh（约第 126 行）**

找到：
```typescript
  }, [threshold, isRefreshing, onRefresh, disabled, isTouchDevice]);
```

改为：
```typescript
  }, [threshold, isRefreshing, disabled, isTouchDevice]);
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run tests/unit/components/pull-to-refresh.test.tsx
```

期望：`PASS`

- [ ] **Step 5: 运行全量测试**

```bash
npm run test:run
```

期望：全部通过。

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/pull-to-refresh.tsx
git commit -m "fix: use onRefreshRef to prevent touchend loss when onRefresh changes mid-gesture on iOS"
```

---

## Task 3：StatsTab 和 DetailsTab 补上 useCallback

**Files:**
- Modify: `src/modules/workspace/ui/StatsTab.tsx`
- Modify: `src/modules/workspace/ui/DetailsTab.tsx`

防御性修复，与 LedgerEntriesTab 保持一致。

### StatsTab.tsx（约第 96 行）

- [ ] **Step 1: 确认 useCallback 在 import 中**

```bash
head -3 src/modules/workspace/ui/StatsTab.tsx
```

如未导入，在 react import 行添加 `useCallback`。

- [ ] **Step 2: 将 handleRefresh 改为 useCallback**

找到：
```typescript
  const handleRefresh = async () => {
    const activeLedgerId = ledgerId ?? "";
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(activeLedgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateCalendar(activeLedgerId) }),
    ]);
  };
```

改为：
```typescript
  const handleRefresh = useCallback(async () => {
    const activeLedgerId = ledgerId ?? "";
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(activeLedgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateCalendar(activeLedgerId) }),
    ]);
  }, [queryClient, ledgerId]);
```

### DetailsTab.tsx（约第 128 行）

- [ ] **Step 3: 将 handleRefresh 改为 useCallback**

（`useCallback` 已在 DetailsTab 第 2 行从 react 导入，无需额外 import）

找到：
```typescript
  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
    ]);
  };
```

改为：
```typescript
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) }),
      queryClient.invalidateQueries({ predicate: invalidateLedgerStats(ledgerId) }),
    ]);
  }, [queryClient, ledgerId]);
```

- [ ] **Step 4: 运行全量测试**

```bash
npm run test:run
```

期望：全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspace/ui/StatsTab.tsx src/modules/workspace/ui/DetailsTab.tsx
git commit -m "fix: wrap handleRefresh in useCallback in StatsTab and DetailsTab"
```

---

## 验收标准

- [ ] `npm run test:run` 全部通过
- [ ] iOS Safari（真机或模拟器）：下拉超过 60px damped（约 120px 真实拉距）后松手，数据重新加载
- [ ] 正常页面滚动不受影响
- [ ] LedgerEntriesTab 行为不变（它本就正确）
