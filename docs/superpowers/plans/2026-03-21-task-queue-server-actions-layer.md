# Task-Queue 模块 Server Actions 分层实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/modules/task-queue/actions.ts` 中直接实现的所有 Server Action 函数体迁移至已有的 `server-actions/` 子目录，使 `actions.ts` 成为符合约定的纯 re-export barrel。

**Architecture:** 纯结构性重组，不改变任何业务逻辑。`server-actions/` 目录已存在但为空，新建 `task-actions.ts` 承载全部函数实现，`actions.ts` 改为纯 re-export。原 `actions.ts` 末尾有类型 re-export，需检查调用方后决定是否保留。

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest

---

## 文件变更地图

### 新建
- `src/modules/task-queue/server-actions/task-actions.ts` — 迁入全部 action 函数

### 修改
- `src/modules/task-queue/actions.ts` — 清理为纯 barrel
- 可能修改：调用方若从 `actions.ts` 导入类型，改为从 `contracts.ts` 导入

---

## Task 1：创建 server-actions/task-actions.ts

**Files:**
- Create: `src/modules/task-queue/server-actions/task-actions.ts`

- [ ] **Step 1：确认现有 actions.ts 完整内容**

  ```bash
  cat src/modules/task-queue/actions.ts
  ```

- [ ] **Step 2：创建 task-actions.ts**

  ```typescript
  // src/modules/task-queue/server-actions/task-actions.ts
  "use server";
  import { requireLedgerAccess, withLedgerAccess } from "@/modules/ledger/access";
  import {    getTaskQueueQuery } from "../application/queries/get-task-queue";
  import {
    batchCancelTasksUseCase,
    cancelTaskUseCase,
  } from "../application/use-cases/cancel-task";
  import {
    batchDismissTasksUseCase,
    dismissTaskUseCase,
  } from "../application/use-cases/dismiss-task";

  export const cancelTaskAction = withLedgerAccess((ledgerId: string, taskId: string) =>
    cancelTaskUseCase(ledgerId, taskId)
  );

  export const batchCancelTasksAction = withLedgerAccess((ledgerId: string, taskIds: string[]) =>
    batchCancelTasksUseCase(ledgerId, taskIds)
  );

  export const dismissTaskAction = withLedgerAccess((ledgerId: string, taskId: string) =>
    dismissTaskUseCase(ledgerId, taskId)
  );

  export const batchDismissTasksAction = withLedgerAccess((ledgerId: string, taskIds: string[]) =>
    batchDismissTasksUseCase(ledgerId, taskIds)
  );

  export async function getTaskQueueForAuthorizedLedger(ledgerId: string) {
    await requireLedgerAccess(ledgerId);
    return getTaskQueueQuery(ledgerId);
  }

  export const getTaskQueueAction = withLedgerAccess((ledgerId: string) =>
    getTaskQueueQuery(ledgerId)
  );
  ```

- [ ] **Step 3：类型检查确认新文件无错**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

---

## Task 2：清理 actions.ts 为纯 barrel

**Files:**
- Modify: `src/modules/task-queue/actions.ts`

- [ ] **Step 1：检查调用方是否从 actions.ts 导入类型**

  ```bash
  grep -rn "from '@/modules/task-queue/actions'\|from \"@/modules/task-queue/actions\"" src/ --include='*.ts' --include='*.tsx'
  ```

  原 `actions.ts` 末尾有：
  ```typescript
  export type { QueueItem, QueueItemKind, QueueItemStatus, TaskQueueItemsResponseDto,
                TaskQueueResult, TaskQueueStats, TaskQueueStatsResponseDto } from "./contracts";
  ```

  若有调用方从 `@/modules/task-queue/actions` 导入这些类型，将其 import 改为从 `@/modules/task-queue/contracts` 导入。

- [ ] **Step 2：将 actions.ts 改为纯 barrel**

  ```typescript
  // src/modules/task-queue/actions.ts
  export {
    cancelTaskAction,
    batchCancelTasksAction,
    dismissTaskAction,
    batchDismissTasksAction,
    getTaskQueueForAuthorizedLedger,
    getTaskQueueAction,
  } from "./server-actions/task-actions";
  ```

- [ ] **Step 3：类型检查**

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
  git add src/modules/task-queue/server-actions/task-actions.ts src/modules/task-queue/actions.ts
  git commit -m "refactor(task-queue): extract server actions into server-actions/ subdir, make actions.ts a pure barrel"
  ```
