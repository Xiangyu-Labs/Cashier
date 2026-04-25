# Currency 模块结构清理实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/modules/currency/` 的根级文件整理至符合项目模块结构约定，使 `use-cases.ts` 回归纯 barrel，并清除空目录和冗余适配层。

**Architecture:** 纯结构性重组，不改变任何业务逻辑。将 `ExchangeRateService`、`exchange-rate-types`、`exchange-rate-helpers`、`CurrencyService` 移入 `application/services/`；将 `use-cases.ts` 中的类型定义和适配函数下沉到 `application/use-cases/`；删除只有一行的冗余适配文件；迁移根级测试文件。

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest

---

## 文件变更地图

### 新建
- `src/modules/currency/application/services/exchange-rate.ts` — 合并 `ExchangeRateService.ts` + `exchange-rate-types.ts` + `exchange-rate-helpers.ts`
- `src/modules/currency/application/services/currency.ts` — 迁移 `service.ts` 中的 `CurrencyService`
- `tests/unit/currency/ExchangeRateService.test.ts` — 迁移自根级
- `tests/unit/currency/exchange-rate-helpers.test.ts` — 迁移自根级
- `tests/unit/currency/contracts.test.ts` — 迁移自根级
- `tests/unit/currency/actions.test.ts` — 迁移自根级

### 修改
- `src/modules/currency/use-cases.ts` — 清理为纯 barrel（删除类型定义和适配函数，改为直接 re-export application/use-cases）
- `src/modules/currency/contracts.ts` — 补充 `BatchCurrencyConversionItem`、`ConvertAmountsBatchResult` 类型（从 use-cases.ts 迁入）
- `src/modules/currency/services.ts` — 更新 import 路径指向新 application/services/ 文件
- `src/modules/currency/events.ts` — 更新 import 路径指向新 application/services/exchange-rate.ts
- `src/modules/currency/application/use-cases/convert-amounts-batch.ts` — 更新 import 路径指向新 application/services/
- `src/modules/currency/application/use-cases/convert-currency.ts` — 更新 import 路径（如有）
- `src/modules/currency/application/use-cases/convert-entry-amount.ts` — 更新 import 路径（如有）

### 删除
- `src/modules/currency/ExchangeRateService.ts` — 内容已迁移
- `src/modules/currency/exchange-rate-types.ts` — 内容已迁移
- `src/modules/currency/exchange-rate-helpers.ts` — 内容已迁移
- `src/modules/currency/service.ts` — 内容已迁移
- `src/modules/currency/client-convert.ts` — 单行冗余适配
- `src/modules/currency/services/` — 空目录
- `src/modules/currency/useAmountDisplay.test.ts` — 已迁移至 tests/
- `src/modules/currency/useConvertedAmount.test.ts` — 已迁移至 tests/
- `src/modules/currency/contracts.test.ts` — 已迁移至 tests/
- `src/modules/currency/actions.test.ts` — 已迁移至 tests/
- `src/modules/currency/ExchangeRateService.test.ts` — 已迁移至 tests/
- `src/modules/currency/exchange-rate-helpers.test.ts` — 已迁移至 tests/

### 保留（不变）
- `src/modules/currency/actions.ts` — 公共 server action 入口，已符合约定
- `src/modules/currency/contracts.ts` — 公共 DTO，补充类型后符合约定
- `src/modules/currency/client.ts` — 有外部引用（`useConvertedAmount`、`useAmountDisplay`），保留
- `src/modules/currency/events.ts` — 有外部引用（`registerExchangeRatesStoredHandler`），保留
- `src/modules/currency/ui/` — 不变
- `src/modules/currency/application/use-cases/` — 内容不变，只更新 import 路径

---

## Task 1：创建 `application/services/exchange-rate.ts`

**Files:**
- Create: `src/modules/currency/application/services/exchange-rate.ts`
- Source: `src/modules/currency/ExchangeRateService.ts`（全量内容）+ `src/modules/currency/exchange-rate-types.ts`（类型）+ `src/modules/currency/exchange-rate-helpers.ts`（helper 函数）

- [ ] **Step 1：读取三个源文件内容**

  ```bash
  cat src/modules/currency/ExchangeRateService.ts
  cat src/modules/currency/exchange-rate-types.ts
  cat src/modules/currency/exchange-rate-helpers.ts
  ```

- [ ] **Step 2：创建合并文件**

  将 `exchange-rate-types.ts` 的类型定义、`exchange-rate-helpers.ts` 的函数、`ExchangeRateService.ts` 的类内容合并到一个文件。内部 import 路径要从相对路径调整。示例结构：

  ```typescript
  // src/modules/currency/application/services/exchange-rate.ts
  import { format } from "date-fns";
  import { db } from "@/lib/db";
  import { currencyRates } from "@/persistence";
  import { eq } from "drizzle-orm";

  // --- Types (原 exchange-rate-types.ts) ---
  export interface ExchangeRates { ... }
  export interface ExchangeRatesStoredEvent { ... }
  export type ExchangeRatesStoredHandler = ...

  // --- Helpers (原 exchange-rate-helpers.ts) ---
  export function formatExchangeRateDate(...) { ... }
  export async function fetchWithRetry(...) { ... }

  // --- Service (原 ExchangeRateService.ts) ---
  export class ExchangeRateService { ... }
  ```

- [ ] **Step 3：运行类型检查确认无错**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无新增 TypeScript 错误。

---

## Task 2：创建 `application/services/currency.ts` 并更新 `services.ts`

**Files:**
- Create: `src/modules/currency/application/services/currency.ts`
- Modify: `src/modules/currency/services.ts`

- [ ] **Step 1：创建 currency.ts**

  ```typescript
  // src/modules/currency/application/services/currency.ts
  export class CurrencyService {
    static calculateExchangeRate(fromAmount: number, toAmount: number): string {
      return (toAmount / fromAmount).toFixed(6);
    }
  }
  ```

- [ ] **Step 2：更新根级 `services.ts` 的 import 路径**

  ```typescript
  // src/modules/currency/services.ts
  export { CurrencyService } from "./application/services/currency";
  export { ExchangeRateService } from "./application/services/exchange-rate";
  ```

- [ ] **Step 3：运行类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

---

## Task 3：更新使用旧路径的 import

**Files:**
- Modify: `src/modules/currency/events.ts`
- Modify: `src/modules/currency/application/use-cases/convert-amounts-batch.ts`
- Modify: `src/modules/currency/application/use-cases/convert-currency.ts`（如有）
- Modify: `src/modules/currency/application/use-cases/convert-entry-amount.ts`（如有）

- [ ] **Step 1：搜索所有仍 import 旧路径的文件**

  ```bash
  grep -rn 'from.*\.\./ExchangeRateService\|from.*exchange-rate-types\|from.*exchange-rate-helpers\|from.*\.\./service"' src/modules/currency/
  ```

- [ ] **Step 2：逐一更新 import**

  - `events.ts`：`from "./ExchangeRateService"` → `from "./application/services/exchange-rate"`
  - `convert-amounts-batch.ts`：`from "../../ExchangeRateService"` → `from "../services/exchange-rate"`
  - 其他文件同理。

- [ ] **Step 3：运行类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

---

## Task 4：清理 `use-cases.ts` 为纯 barrel，并补充 `contracts.ts`

**Files:**
- Modify: `src/modules/currency/use-cases.ts`
- Modify: `src/modules/currency/contracts.ts`

**背景：** 当前 `use-cases.ts` 中定义了 `BatchCurrencyConversionItem` 和 `ConvertAmountsBatchResult` 两个类型，以及 `convertAmountsBatch` 适配函数和 `batchConvertCurrency` 函数。这些内容违反纯 barrel 约定：
- 两个类型应迁入 `contracts.ts`（公共 DTO）
- `convertAmountsBatch` 是 `application/use-cases/convert-amounts-batch.ts` 的适配层，外部有引用（`ledger` 模块），需检查是否可直接改为调用 application 层
- `batchConvertCurrency` 与 `actions.ts` 中的 `batchConvertCurrencyAction` 功能重复

- [ ] **Step 1：检查 `convertAmountsBatch` 和 `batchConvertCurrency` 的外部引用**

  ```bash
  grep -rn 'from.*currency/use-cases' src/
  ```

  记录哪些调用者用了 `convertAmountsBatch`（`BatchCurrencyConversionItem` 入参）vs 哪些用了 `batchConvertCurrency`（`BatchConversionItem` 入参）。

- [ ] **Step 2：将 `BatchCurrencyConversionItem` 和 `ConvertAmountsBatchResult` 迁入 `contracts.ts`**

  在 `contracts.ts` 末尾追加：

  ```typescript
  export interface BatchCurrencyConversionItem {
    amount: number;
    from: string;
    to: string;
    date?: string;
  }

  export type ConvertAmountsBatchResult = CurrencyBatchConversionResult[];
  ```

  注：`CurrencyBatchConversionResult` 来自 `application/use-cases/convert-amounts-batch.ts`，contracts.ts 需 import 它。

- [ ] **Step 3：将 `use-cases.ts` 清理为纯 barrel**

  ```typescript
  // src/modules/currency/use-cases.ts
  export {
    convertCurrency,
    type ConvertCurrencyInput,
    type ConvertCurrencyResult,
  } from "./application/use-cases/convert-currency";
  export {
    convertEntryAmount,
    type ConvertEntryAmountInput,
    type ConvertEntryAmountResult,
  } from "./application/use-cases/convert-entry-amount";
  export {
    convertAmountsBatch,
    type CurrencyBatchConversionItem,
    type CurrencyBatchConversionResult,
    type ConvertAmountsBatchOptions,
  } from "./application/use-cases/convert-amounts-batch";
  ```

  注意：`ledger` 模块调用 `convertAmountsBatch` 时传入的是 `{from, to}` 结构（`BatchCurrencyConversionItem`）而 application 层的 use case 接受的是 `{fromCurrency, toCurrency}` 结构（`CurrencyBatchConversionItem`）。如果 ledger 层当前通过 use-cases.ts 的适配层调用，需要先确认 ledger 层的调用代码，决定是修改 ledger 层的参数结构，还是在 application
  注意：`ledger` 模块的 `recalculate-entries-converted-amount.ts` 调用 `convertAmountsBatch` 时传入的是 `{from, to}` 字段名（`ConversionItem` 接口），而 application 层接受 `{fromCurrency, toCurrency}` 字段名（`CurrencyBatchConversionItem`）。清理方案是：更新 ledger 模块的 `buildConversionItems` 改用 `fromCurrency`/`toCurrency` 字段名，使其直接符合 application 层的接口，从而消除适配层存在的必要性。

- [ ] **Step 4：更新 `ledger` 模块的调用代码**

  修改 `src/modules/ledger/application/services/recalculate-entries-converted-amount.ts`：

  ```typescript
  import {
    convertAmountsBatch,
    type CurrencyBatchConversionItem,
    type CurrencyBatchConversionResult,
  } from "@/modules/currency/use-cases";

  // 删除本地 ConversionItem 接口，改用 CurrencyBatchConversionItem
  export function buildConversionItems(
    entries: Awaited<ReturnType<typeof fetchEntriesForConversion>>,
    mainCurrency: string
  ): CurrencyBatchConversionItem[] {
    return entries.map((entry) => ({
      amount: Number(entry.amount),
      fromCurrency: entry.currency ?? "CNY",  // from -> fromCurrency
      toCurrency: mainCurrency,               // to -> toCurrency
      ...(entry.sourceDocument?.entryDate != null ? { date: entry.sourceDocument.entryDate } : {}),
    }));
  }
  ```

- [ ] **Step 5：运行类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

- [ ] **Step 6：运行相关测试**

  ```bash
  npx vitest run tests/integration/ledger/
  ```

  预期：全部 PASS。

- [ ] **Step 7：Commit**

  ```bash
  git add src/modules/currency/use-cases.ts src/modules/currency/contracts.ts src/modules/ledger/application/services/recalculate-entries-converted-amount.ts
  git commit -m "refactor(currency): make use-cases.ts a pure barrel, update ledger caller to use application types"
  ```

---

## Task 5：删除冗余文件和空目录

**Files:**
- Delete: `src/modules/currency/ExchangeRateService.ts`
- Delete: `src/modules/currency/exchange-rate-types.ts`
- Delete: `src/modules/currency/exchange-rate-helpers.ts`
- Delete: `src/modules/currency/service.ts`
- Delete: `src/modules/currency/client-convert.ts`
- Delete: `src/modules/currency/services/` (空目录)

- [ ] **Step 1：确认所有被删文件已无引用**

  ```bash
  grep -rn 'from.*currency/ExchangeRateService\|from.*exchange-rate-types\|from.*exchange-rate-helpers\|from.*currency/service"\|from.*client-convert' src/
  ```

  预期：**无任何输出**。若有输出，先修复引用再删除。

- [ ] **Step 2：删除文件和空目录**

  ```bash
  rm src/modules/currency/ExchangeRateService.ts
  rm src/modules/currency/exchange-rate-types.ts
  rm src/modules/currency/exchange-rate-helpers.ts
  rm src/modules/currency/service.ts
  rm src/modules/currency/client-convert.ts
  rmdir src/modules/currency/services
  ```

- [ ] **Step 3：运行类型检查**

  ```bash
  npx tsc --noEmit 2>&1 | head -30
  ```

  预期：无错误。

- [ ] **Step 4：Commit**

  ```bash
  git add -A
  git commit -m "refactor(currency): remove files superseded by application/services/ restructure"
  ```

---

## Task 6：迁移根级测试文件

**Files:**
- Create: `tests/unit/currency/ExchangeRateService.test.ts`
- Create: `tests/unit/currency/exchange-rate-helpers.test.ts`
- Create: `tests/unit/currency/contracts.test.ts`
- Create: `tests/unit/currency/actions.test.ts`
- Delete: 对应根级文件
- 保留: `src/modules/currency/useAmountDisplay.test.ts`、`src/modules/currency/useConvertedAmount.test.ts`（测试根级 hook 文件，放置在 src 旁边可接受）

- [ ] **Step 1：移动测试文件**

  ```bash
  mkdir -p tests/unit/currency
  mv src/modules/currency/ExchangeRateService.test.ts tests/unit/currency/
  mv src/modules/currency/exchange-rate-helpers.test.ts tests/unit/currency/
  mv src/modules/currency/contracts.test.ts tests/unit/currency/
  mv src/modules/currency/actions.test.ts tests/unit/currency/
  ```

- [ ] **Step 2：修复测试文件中的 import 路径**

  测试文件中的 import 路径会因目录变化而失效，需要从 `"./ExchangeRateService"` 改为 `"@/modules/currency/application/services/exchange-rate"` 等，或者使用 `@/` 别名。

  ```bash
  # 检查需要修复的 import
  grep -n 'from' tests/unit/currency/ExchangeRateService.test.ts
  grep -n 'from' tests/unit/currency/exchange-rate-helpers.test.ts
  grep -n 'from' tests/unit/currency/contracts.test.ts
  grep -n 'from' tests/unit/currency/actions.test.ts
  ```

  逐一修复为 `@/` 路径。

- [ ] **Step 3：运行迁移后的测试**

  ```bash
  npx vitest run tests/unit/currency/
  ```

  预期：全部 PASS。

- [ ] **Step 4：Commit**

  ```bash
  git add -A
  git commit -m "refactor(currency): migrate root-level test files to tests/unit/currency/"
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

# 4. 确认 currency 模块根级文件符合约定
ls src/modules/currency/*.ts
# 预期只剩：actions.ts contracts.ts use-cases.ts services.ts client.ts events.ts
# 以及 hook 文件：useAmountDisplay.ts useConvertedAmount.ts 及其测试

# 5. 确认 application/services/ 已存在
ls src/modules/currency/application/services/
# 预期：exchange-rate.ts currency.ts
```
