# 模块结构合规整改实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 auth、stats、task-queue、currency、source-document 五个模块整改为符合项目模块结构约定：`actions.ts` 为纯 re-export barrel，`queries.ts` 为纯 re-export barrel，以及迁移残留在 `src/` 内的测试文件。

**Architecture:** 纯结构性重组，不改变任何业务逻辑。将各 `actions.ts` 中的函数体移入 `server-actions/` 子目录，将 `source-document/queries.ts` 中的函数体移入 application 层，将 `currency/contracts.ts` 中的跨层 re-export 改为本地类型定义，迁移测试文件。

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest

---

## 文件变更地图

### 新建
- `src/modules/auth/server-actions/send-otp.ts` — 迁入 `sendOTPAction`
- `src/modules/auth/server-actions/delete-account.ts` — 迁入 `deleteAccount`
- `src/modules/stats/server-actions/get-enhanced-stats.ts` — 迁入 `getEnhancedStats`
- `src/modules/task-queue/server-actions/task-actions.ts` — 迁入所有 task-queue action 函数
- `src/modules/currency/server-actions/convert-currency.ts` — 迁入两个 currency action 函数
- `tests/unit/auth/actions.test.ts` — 迁移自 src/
- `tests/unit/task-queue/types.test.ts` — 迁移自 src/
- `tests/unit/workspace/` — 迁移 3 个测试文件
- `tests/unit/stats/utils.test.ts` — 迁移自 src/

### 修改
- `src/modules/auth/actions.ts` — 清理为纯 barrel
- `src/modules/stats/actions.ts` — 清理为纯 barrel
- `src/modules/task-queue/actions.ts` — 清理为纯 barrel
- `src/modules/currency/actions.ts` — 清理为纯 barrel
- `src/modules/currency/contracts.ts` — 移除跨层 re-export，改为本地类型定义
- `src/modules/source-document/application/queries/source-document-queries.ts` — 将验证逻辑下沉至此
- `src/modules/source-document/queries.ts` — 清理为纯 barrel

### 删除
- `src/modules/auth/actions.test.ts`
- `src/modules/stats/utils.test.ts`
- `src/modules/task-queue/types.test.ts`
- `src/modules/workspace/initial-query-state.test.ts`
- `src/modules/workspace/ledger-url-navigation.test.ts`
- `src/modules/workspace/ledger-url-params.test.ts`

---

## Task 1：auth/actions.ts 分层

**Files:**
- Create: `src/modules/auth/server-actions/send-otp.ts`
- Create: `src/modules/auth/server-actions/delete-account.ts`
- Modify: `src/modules/auth/actions.ts`

- [ ] **Step 1：创建 send-otp.ts**

  ```typescript
  // src/modules/auth/server-actions/send-otp.ts
  "use server";
  import { headers } from "next/headers";
  import { getClientIPFromHeaders } from "@/lib/utils/ip";
  import { sendOTP } from "../use-cases";

  export async function sendOTPAction(email: string, _locale: string = "en") {
    const requestHeaders = await headers();
    return sendOTP({
      email,
      ip: getClientIPFromHeaders(requestHeaders),
      host: requestHeaders.get("host") ?? "localhost",
    });
  }
  ```

- [ ] **Step 2：创建 delete-account.ts**

  ```typescript
  // src/modules/auth/server-actions/delete-account.ts
  "use server";
  import { signOut } from "@/auth";
  import { withAuth } from "@/lib/auth-actions";
  import { deleteAccount as deleteAccountUseCase } from "../use-cases";

  export const deleteAccount = withAuth(async (userId: string) => {
    await deleteAccountUseCase(userId);
    await signOut({ redirectTo: "/" });
  });
  ```

- [ ] **Step 3：更新 auth/actions.ts 为纯 barrel**

  ```typescript
  // src/modules/auth/actions.ts
  export { sendOTPAction } from "./server-actions/send-otp";
  export { deleteAccount } from "./server-actions/delete-account";
  ```

- [ ] **Step 4：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无新增错误。

- [ ] **Step 5：Commit**

  ```bash
  git add src/modules/auth/server-actions/ src/modules/auth/actions.ts
  git commit -m "refactor(auth): extract server-actions into server-actions/ subdir"
  ```

---

## Task 2：stats/actions.ts 分层

**Files:**
- Create: `src/modules/stats/server-actions/get-enhanced-stats.ts`
- Modify: `src/modules/stats/actions.ts`

- [ ] **Step 1：创建 get-enhanced-stats.ts**

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

- [ ] **Step 2：更新 stats/actions.ts 为纯 barrel**

  ```typescript
  // src/modules/stats/actions.ts
  export { getEnhancedStats } from "./server-actions/get-enhanced-stats";
  ```

- [ ] **Step 3：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 4：Commit**

  ```bash
  git add src/modules/stats/server-actions/ src/modules/stats/actions.ts
  git commit -m "refactor(stats): extract server-actions into server-actions/ subdir"
  ```

---

## Task 3：task-queue/actions.ts 分层

**Files:**
- Create: `src/modules/task-queue/server-actions/task-actions.ts`
- Modify: `src/modules/task-queue/actions.ts`

注：`server-actions/` 目录已存在但为空。

- [ ] **Step 1：创建 task-actions.ts**

  ```typescript
  // src/modules/task-queue/server-actions/task-actions.ts
  "use server";
  import { requireLedgerAccess, withLedgerAccess } from "@/modules/ledger/access";
  import { getTaskQueueQuery } from "../application/queries/get-task-queue";
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

- [ ] **Step 2：更新 task-queue/actions.ts 为纯 barrel**

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

  注：原 `actions.ts` 末尾有 `export type { ... } from "./contracts"`。这些类型应由调用方直接从 `@/modules/task-queue/contracts` 导入，无需在 actions.ts 中 re-export。如果有外部调用者依赖 `from '@/modules/task-queue/actions'` 导入类型，执行前先检查：

  ```bash
  grep -rn "from '@/modules/task-queue/actions'" src/ --include='*.ts' --include='*.tsx'
  ```

  若有调用者依赖类型 re-export，将对应 import 改为从 `@/modules/task-queue/contracts` 导入。

- [ ] **Step 3：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 4：Commit**

  ```bash
  git add src/modules/task-queue/server-actions/ src/modules/task-queue/actions.ts
  git commit -m "refactor(task-queue): extract server-actions into server-actions/ subdir"
  ```

---

## Task 4：currency/actions.ts 分层

**Files:**
- Create: `src/modules/currency/server-actions/convert-currency.ts`
- Modify: `src/modules/currency/actions.ts`

- [ ] **Step 1：创建 convert-currency.ts**

  ```typescript
  // src/modules/currency/server-actions/convert-currency.ts
  "use server";
  import { convertAmountsBatch } from "../application/use-cases/convert-amounts-batch";
  import { convertCurrency } from "../application/use-cases/convert-currency";
  import type {
    BatchConversionItem,
    BatchConvertCurrencyResult,
    ConvertCurrencyResult,
  } from "../contracts";

  export async function convertCurrencyAction(
    amount: number,
    from: string,
    to: string,
    date?: string
  ): Promise<ConvertCurrencyResult> {
    return convertCurrency({
      amount,
      from,
      to,
      ...(date != null ? { date } : {}),
    });
  }

  export async function batchConvertCurrencyAction(
    items: BatchConversionItem[],
    targetCurrency: string
  ): Promise<BatchConvertCurrencyResult> {
    if (items.length === 0 || targetCurrency === "") {
      throw new Error("Missing required parameters");
    }
    const results = await convertAmountsBatch(
      items.map((item) => ({
        amount: item.amount,
        fromCurrency: item.currency,
        toCurrency: targetCurrency,
        ...(item.date != null ? { date: item.date } : {}),
      })),
      targetCurrency,
      {
        allowBlankSourceCurrency: true,
        fallbackToOriginalAmountOnMissingRate: true,
      }
    );
    return { results: results.map((item) => item.convertedAmount) };
  }
  ```

- [ ] **Step 2：更新 currency/actions.ts 为纯 barrel**

  ```typescript
  // src/modules/currency/actions.ts
  "use server";
  export {
    convertCurrencyAction,
    batchConvertCurrencyAction,
  } from "./server-actions/convert-currency";
  ```

  注：原 `actions.ts` 有 `export type { ... }` from contracts。检查调用方是否依赖从 actions 导入类型：

  ```bash
  grep -rn "from '@/modules/currency/actions'" src/ --include='*.ts' --include='*.tsx'
  ```

  若有类型导入，改为从 `@/modules/currency/contracts` 导入。

- [ ] **Step 3：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 4：Commit**

  ```bash
  git add src/modules/currency/server-actions/ src/modules/currency/actions.ts
  git commit -m "refactor(currency): extract server-actions into server-actions/ subdir"
  ```

---

## Task 5：source-document/queries.ts 清理为纯 barrel

**Files:**
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `src/modules/source-document/queries.ts`

**背景：** 当前 `queries.ts` 有 4 个函数实现，其中 `listSourceDocuments` 含 Zod 校验（`listSourceDocumentsInputSchema.parse`），其余三个是简单 pass-through wrapper。

- [ ] **Step 1：读取 source-document-queries.ts 现有内容**

  ```bash
  cat src/modules/source-document/application/queries/source-document-queries.ts
  ```

- [ ] **Step 2：将 listSourceDocuments 验证逻辑下沉至 source-document-queries.ts**

  在 `source-document-queries.ts` 中，将现有的 `listSourceDocumentsQuery` 函数重命名或调整，使其接受 `ListSourceDocumentsInput`（含 Zod 校验）并直接返回结果。新增一个导出函数 `listSourceDocumentsQuery` 接受验证后的 input：

  具体做法：在 `source-document-queries.ts` 中新增：
  ```typescript
  import {
    listSourceDocumentsInputSchema,
    type ListSourceDocumentsInput,
  } from "@/modules/source-document/contract-schemas";

  export async function listSourceDocuments(
    ledgerId: string,
    params: ListSourceDocumentsInput
  ): Promise<SourceDocumentPageDto> {
    const validated = listSourceDocumentsInputSchema.parse(params);
    return listSourceDocumentsQuery(ledgerId, {
      status: validated.status ?? null,
      startDate: validated.startDate ?? null,
      endDate: validated.endDate ?? null,
      cursor: validated.cursor ?? null,
      limit: validated.limit,
      includeLedgerEntries: validated.includeEntries,
    });
  }
  ```

  其余三个函数（`getAllSourceDocuments`、`getPendingSourceDocuments`、`getSourceDocumentFull`）的 wrapper 是纯 pass-through，直接在 `source-document-queries.ts` 中加同名导出即可（或确认原有函数名是否已匹配）。

- [ ] **Step 3：更新 source-document/queries.ts 为纯 barrel**

  ```typescript
  // src/modules/source-document/queries.ts
  export {
    listSourceDocuments,
    getAllSourceDocuments,
    getPendingSourceDocuments,
    getSourceDocumentFull,
  } from "./application/queries/source-document-queries";
  ```

- [ ] **Step 4：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

- [ ] **Step 5：Commit**

  ```bash
  git add src/modules/source-document/queries.ts src/modules/source-document/application/queries/source-document-queries.ts
  git commit -m "refactor(source-document): make queries.ts a pure barrel, move validation into application layer"
  ```

---

## Task 6：修复 currency/contracts.ts 跨层 re-export

**Files:**
- Modify: `src/modules/currency/contracts.ts`

**背景：** `contracts.ts` 当前有 `export type { ConvertCurrencyResult } from "./application/use-cases/convert-currency"`，违反了 contracts.ts 只放本地类型定义的约定。

- [ ] **Step 1：读取 application/use-cases/convert-currency.ts，找 ConvertCurrencyResult 定义**

  ```bash
  grep -n 'ConvertCurrencyResult' src/modules/currency/application/use-cases/convert-currency.ts
  ```

- [ ] **Step 2：在 contracts.ts 中本地定义或保留该类型**

  如果 `ConvertCurrencyResult` 是简单类型，直接在 `contracts.ts` 末尾定义：

  ```typescript
  export interface ConvertCurrencyResult {
    // 从 convert-currency.ts 复制类型定义
  }
  ```

  然后在 `application/use-cases/convert-currency.ts` 中改为从 contracts 导入（如果 application 层需要该类型）或直接删除 contracts.ts 中的 re-export 行，改为本地定义。

- [ ] **Step 3：检查引用方**

  ```bash
  grep -rn 'ConvertCurrencyResult' src/ --include='*.ts' --include='*.tsx'
  ```

  确保所有引用方都能正常解析（通过 contracts.ts 或 use-cases.ts）。

- [ ] **Step 4：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

- [ ] **Step 5：Commit**

  ```bash
  git add src/modules/currency/contracts.ts
  git commit -m "refactor(currency): remove cross-layer re-export from contracts.ts"
  ```

---

## Task 7：迁移 src/ 内的测试文件

**Files:**
- Move: `src/modules/auth/actions.test.ts` → `tests/unit/auth/`
- Move: `src/modules/stats/utils.test.ts` → `tests/unit/stats/`
- Move: `src/modules/task-queue/types.test.ts` → `tests/unit/task-queue/`
- Move: `src/modules/workspace/*.test.ts` → `tests/unit/workspace/`

- [ ] **Step 1：移动文件**

  ```bash
  mkdir -p tests/unit/auth tests/unit/stats tests/unit/task-queue tests/unit/workspace
  mv src/modules/auth/actions.test.ts tests/unit/auth/
  mv src/modules/stats/utils.test.ts tests/unit/stats/
  mv src/modules/task-queue/types.test.ts tests/unit/task-queue/
  mv src/modules/workspace/initial-query-state.test.ts tests/unit/workspace/
  mv src/modules/workspace/ledger-url-navigation.test.ts tests/unit/workspace/
  mv src/modules/workspace/ledger-url-params.test.ts tests/unit/workspace/
  ```

- [ ] **Step 2：检查并修复 import 路径**

  ```bash
  grep -n 'from' tests/unit/auth/actions.test.ts
  grep -n 'from' tests/unit/stats/utils.test.ts
  grep -n 'from' tests/unit/task-queue/types.test.ts
  grep -n 'from' tests/unit/workspace/initial-query-state.test.ts
  grep -n 'from' tests/unit/workspace/ledger-url-navigation.test.ts
  grep -n 'from' tests/unit/workspace/ledger-url-params.test.ts
  ```

  将所有相对路径改为 `@/` 别名路径。

- [ ] **Step 3：运行迁移后的测试**

  ```bash
  npx vitest run tests/unit/auth/ tests/unit/stats/ tests/unit/task-queue/ tests/unit/workspace/
  ```

  预期：全部 PASS。

- [ ] **Step 4：Commit**

  ```bash
  git add -A
  git commit -m "refactor: migrate src/-resident test files to tests/unit/"
  ```

---

## 验证

完成所有 Task 后执行完整验证：

```bash
# 1. 全量测试
npx vitest run

# 2. 类型检查
npx tsc --noEmit

# 3. Lint
npm run lint

# 4. 确认各模块 actions.ts 为纯 barrel（不含函数体）
grep -n 'async function\|export const.*=.*(' \
  src/modules/auth/actions.ts \
  src/modules/stats/actions.ts \
  src/modules/task-queue/actions.ts \
  src/modules/currency/actions.ts
# 预期：无输出

# 5. 确认 queries.ts 为纯 barrel
grep -n 'async function\|export const.*=.*(' \
  src/modules/source-document/queries.ts
# 预期：无输出

# 6. 确认 src/ 内无残留 test 文件（除 currency/ 目录，由另一 agent 处理）
find src/modules -name '*.test.ts' | grep -v 'currency'
# 预期：无输出（或仅剩 currency 的，由另一计划覆盖）
```
