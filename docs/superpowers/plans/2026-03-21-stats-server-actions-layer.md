# Stats 模块 Server Actions 分层实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/modules/stats/actions.ts` 中直接实现的 Server Action 函数体迁移至 `server-actions/` 子目录，使 `actions.ts` 成为符合约定的纯 re-export barrel。

**Architecture:** 纯结构性重组，不改变任何业务逻辑。新建 `stats/server-actions/get-enhanced-stats.ts` 承载函数实现，`actions.ts` 改为单行 re-export。

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest

---

## 文件变更地图

### 新建
- `src/modules/stats/server-actions/get-enhanced-stats.ts` — 迁入 `getEnhancedStats` 函数体

### 修改
- `src/modules/stats/actions.ts` — 清理为纯 barrel（只 re-export server-actions/）

---

## Task 1：创建 server-actions/get-enhanced-stats.ts

**Files:**
- Create: `src/modules/stats/server-actions/get-enhanced-stats.ts`

- [ ] **Step 1：确认现有 actions.ts 内容**

  ```bash
  cat src/modules/stats/actions.ts
  ```

  预期输出（已知内容，确认无遗漏）：
  ```typescript
  "use server";
  import { requireLedgerAccess } from "@/modules/ledger/access";
  import { getEnhancedStatsQuery } from "./application/queries/get-enhanced-stats";
  import type { EnhancedStatsDto } from "./contracts";

  export async function getEnhancedStats({ ledgerId, queryRange, compareRange }) { ... }
  ```

- [ ] **Step 2：创建 server-actions/get-enhanced-stats.ts**

  ```typescript
  // src/modules/stats/server-actions/get-enhanced-stats.ts
  "use server";
  import { requireLedgerAccess } from "@/modules/ledger/access";
  import { getEnhancedStatsQuery } from "../application/queries/get-enhanced-stats";
  import type { EnhancedStatsDto } from "../contracts";

  export async function getEnhancedStats({
    ledgerId,
    queryRange,
    compareRange,
  }: {
    ledgerId: string;
    queryRange: { from: string; to: string };
    compareRange: { from: string; to: string };
  }): Promise<EnhancedStatsDto> {
    await requireLedgerAccess(ledgerId);
    return getEnhancedStatsQuery({ ledgerId, queryRange, compareRange });
  }
  ```

- [ ] **Step 3：运行类型检查确认新文件无错**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

---

## Task 2：将 actions.ts 清理为纯 barrel

**Files:**
- Modify: `src/modules/stats/actions.ts`

- [ ] **Step 1：检查所有引用 stats/actions 的调用方**

  ```bash
  grep -rn "from '@/modules/stats/actions'\|from \"@/modules/stats/actions\"" src/ --include='*.ts' --include='*.tsx'
  ```

  确认调用方使用的导出名（应为 `getEnhancedStats`），无其他意外导出。

- [ ] **Step 2：将 actions.ts 改为纯 barrel**

  ```typescript
  // src/modules/stats/actions.ts
  export { getEnhancedStats } from "./server-actions/get-enhanced-stats";
  ```

- [ ] **Step 3：运行类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

- [ ] **Step 4：运行全量测试**

  ```bash
  npx vitest run
  ```

  预期：全部 PASS。

- [ ] **Step 5：Commit**

  ```bash
  git add src/modules/stats/server-actions/get-enhanced-stats.ts src/modules/stats/actions.ts
  git commit -m "refactor(stats): extract server action into server-actions/ subdir, make actions.ts a pure barrel"
  ```
