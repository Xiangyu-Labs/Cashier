# Currency 模块 Actions 分层与 Contracts 修复实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/modules/currency/actions.ts` 中的 Server Action 实现迁移至 `server-actions/` 子目录，使 `actions.ts` 成为纯 re-export barrel；同时修复 `contracts.ts` 中违反约定的跨层 import/re-export。

**Architecture:** 纯结构性重组，不改变任何业务逻辑。两项改动都在 currency 模块内，合并为一个计划避免冲突。新建 `currency/server-actions/convert-currency.ts` 承载函数实现；`contracts.ts` 中的跨层引用全部移除，改为本地类型定义或通过 use-cases barrel 暴露。

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest

---

## 文件变更地图

### 新建
- `src/modules/currency/server-actions/convert-currency.ts` — 迁入两个 action 函数体

### 修改
- `src/modules/currency/actions.ts` — 清理为纯 barrel
- `src/modules/currency/contracts.ts` — 移除跨层 import/re-export，改为本地类型定义
- 可能修改：调用方若从 `actions.ts` 导入类型，改为从 `contracts.ts` 导入

---

## Task 1：创建 server-actions/convert-currency.ts

**Files:**
- Create: `src/modules/currency/server-actions/convert-currency.ts`

- [ ] **Step 1：确认现有 actions.ts 完整内容**

  ```bash
  cat src/modules/currency/actions.ts
  ```

  已知内容（执行前核对，确认无遗漏）：
  - `convertCurrencyAction`：调用 `convertCurrency` use case
  - `batchConvertCurrencyAction`：含参数校验 + 调用 `convertAmountsBatch`

- [ ] **Step 2：创建 server-actions/convert-currency.ts**

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

- [ ] **Step 3：类型检查确认新文件无错**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

---

## Task 2：清理 actions.ts 为纯 barrel

**Files:**
- Modify: `src/modules/currency/actions.ts`

- [ ] **Step 1：检查调用方是否从 actions.ts 导入类型**

  ```bash
  grep -rn "from '@/modules/currency/actions'\|from \"@/modules/currency/actions\"" src/ --include='*.ts' --include='*.tsx'
  ```

  原 `actions.ts` 有 `export type { BatchConversionItem, BatchConvertCurrencyResult, ConvertCurrencyResult }`。
  若有调用方从 `@/modules/currency/actions` 导入这些类型，将其改为从 `@/modules/currency/contracts` 导入。

- [ ] **Step 2：将 actions.ts 改为纯 barrel**

  ```typescript
  // src/modules/currency/actions.ts
  "use server";
  export {
    convertCurrencyAction,
    batchConvertCurrencyAction,
  } from "./server-actions/convert-currency";
  ```

- [ ] **Step 3：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

- [ ] **Step 4：Commit**

  ```bash
  git add src/modules/currency/server-actions/convert-currency.ts src/modules/currency/actions.ts
  git commit -m "refactor(currency): extract server actions into server-actions/ subdir, make actions.ts a pure barrel"
  ```

---

## Task 3：修复 contracts.ts 跨层 re-export

**Files:**
- Modify: `src/modules/currency/contracts.ts`

**背景：** 当前 `contracts.ts` 有以下三处违规（contracts.ts 不应引用 application 内部路径）：

```typescript
// 违规 1：import application 内部类型
import type { CurrencyBatchConversionResult } from "./application/use-cases/convert-amounts-batch";

// 违规 2：re-export application 内部类型
export type { ConvertCurrencyResult } from "./application/use-cases/convert-currency";

// 违规 3：依赖违规 1 的无意义 alias
export type ConvertAmountsBatchResult = CurrencyBatchConversionResult[];
```

此外 `BatchCurrencyConversionItem`（`from`/`to` 字段）与 application 层的 `CurrencyBatchConversionItem`（`fromCurrency`/`toCurrency` 字段）命名相近但字段不同，需确认是否仍有外部调用方依赖。

- [ ] **Step 1：调查所有引用方**

  ```bash
  # 检查 ConvertCurrencyResult 引用方
  grep -rn 'ConvertCurrencyResult' src/ --include='*.ts' --include='*.tsx'

  # 检查 ConvertAmountsBatchResult 引用方
  grep -rn 'ConvertAmountsBatchResult' src/ --include='*.ts' --include='*.tsx'

  # 检查 BatchCurrencyConversionItem（from/to 版）引用方
  grep -rn 'BatchCurrencyConversionItem' src/ --include='*.ts' --include='*.tsx'
  ```

  记录每个类型的引用路径，确认是从 `contracts`、`actions` 还是 `use-cases` 导入。

- [ ] **Step 2：修复 ConvertCurrencyResult（违规 2）**

  读取 application 层的实际类型定义：

  ```bash
  grep -n -A8 'export.*ConvertCurrencyResult' src/modules/currency/application/use-cases/convert-currency.ts
  ```

  **处理方案（二选一，执行时根据实际情况判断）：**

  - 若调用方都从 `use-cases.ts` barrel 导入 → 直接删除 `contracts.ts` 中的跨层 re-export 行，无需本地重定义
  - 若调用方从 `contracts` 导入 → 在 `contracts.ts` 中本地复制该类型定义，删除跨层 re-export 行；application 层保留自己的定义（不反向依赖 contracts，避免循环）

- [ ] **Step 3：移除 CurrencyBatchConversionResult import 和 ConvertAmountsBatchResult alias（违规 1 + 3）**

  直接删除以下两行：
  - `import type { CurrencyBatchConversionResult } from "./application/use-cases/convert-amounts-batch"`
  - `export type ConvertAmountsBatchResult = CurrencyBatchConversionResult[]`

  若有调用方使用了 `ConvertAmountsBatchResult`，将其替换为 `CurrencyBatchConversionResult[]`（从 `@/modules/currency/use-cases` 导入 `CurrencyBatchConversionResult`）。

- [ ] **Step 4：清理 BatchCurrencyConversionItem（视调用情况）**

  若 Step 1 发现 `BatchCurrencyConversionItem`（`from`/`to` 字段）已无外部调用方，删除该接口定义（application 层已有 `CurrencyBatchConversionItem` 使用 `fromCurrency`/`toCurrency`，两个概念应统一）。若仍有调用方依赖，保留并在注释中说明这是公共适配类型。

- [ ] **Step 5：类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

- [ ] **Step 6：运行全量测试**

  ```bash
  npx vitest run
  ```

  预期：全部 PASS。

- [ ] **Step 7：Commit**

  ```bash
  git add src/modules/currency/contracts.ts
  git commit -m "refactor(currency): remove cross-layer imports from contracts.ts, clean up redundant type aliases"
  ```
