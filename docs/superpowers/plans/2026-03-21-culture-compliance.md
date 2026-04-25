# Culture 合规收口实施计划

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除项目与 culture 文档之间的结构性偏差，使所有模块符合统一的模块模板约定。

**Architecture:** 本次改动为纯结构性收口，不涉及业务逻辑变更。主要工作是将 currency 模块补齐 `contracts.ts`，将分散在 actions.ts 和 use-cases.ts 中的公共 DTO 类型集中到 contracts.ts，并清理重构遗留的空目录噪音。

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest

---

## 审查结论

经过全面审查，项目总体上高度符合 CLAUDE.md 所描述的 culture：

| 原则 | 状态 | 说明 |
|------|------|------|
| 模块结构 (actions/contracts/application/server-actions) | ✅ 高度遵守 | 除 currency 外所有模块完整 |
| Server Actions 直接 throw | ✅ 完全遵守 | 无 `{success, error}` 返回模式 |
| 标准化错误类 | ✅ 完全遵守 | 所有模块一致使用 AppError 子类 |
| useLedgerMutation | ✅ 高度遵守 | 覆盖所有主要 mutation hooks |
| queryKeys 集中管理 | ✅ 完全遵守 | 无硬编码 queryKey 字符串 |
| 日期存为 yyyy-MM-dd | ✅ 遵守 | 业务日期文本，系统时间戳整数 |
| App 层 thin | ✅ 完全遵守 | page.tsx 只做路由+注水 |
| 架构边界测试 | ✅ 超出预期 | ESLint 规则 + 专门测试守护模块边界 |
| currency contracts.ts | ❌ 缺失 | 公共 DTO 类型分散在 actions.ts 和 use-cases.ts 中 |

**已通过最近 commit 修复的历史问题（无需处理）：**
- `verifyLedgerOwnership` 重复已删除（auth-actions.ts 已清理）
- `src/types/` shim 层已删除（commit `4119a6f1`）
- 测试目录结构已统一（commit `00ff8e88`）
- task-queue 模块已有 `contracts.ts`

---

## Currency 模块类型分布（现状）

```
application/use-cases/convert-currency.ts
  └─ 定义: ConvertCurrencyInput, ConvertCurrencyResult

application/use-cases/convert-amounts-batch.ts
  └─ 定义: CurrencyBatchConversionItem, CurrencyBatchConversionResult, ConvertAmountsBatchOptions

use-cases.ts
  └─ re-export: convertCurrency, ConvertCurrencyInput, ConvertCurrencyResult
  └─ 定义(内部适配层): BatchCurrencyConversionItem, ConvertAmountsBatchResult
  └─ 定义(内联重复): BatchConvertCurrencyResult { results: number[] }  ← 与 actions.ts 重复

actions.ts
  └─ re-export: ConvertCurrencyResult (via use-cases.ts)
  └─ 定义(内联): BatchConversionItem { amount, currency, date? }   ← 应移入 contracts.ts
  └─ 定义(内联): BatchConvertCurrencyResult { results: number[] }  ← 应移入 contracts.ts
```

**需要整合到 contracts.ts 的公共 DTO：**
- `BatchConversionItem` — `batchConvertCurrencyAction` 的输入类型（仅在 actions.ts 中使用）
- `BatchConvertCurrencyResult` — `batchConvertCurrencyAction` 的返回类型（actions.ts 和 use-cases.ts 各有一份重复定义）
- `ConvertCurrencyResult` — 从 contracts.ts re-export（实际来源保持为 application 层）

**保持不动的内部类型（非公共 API）：**
- `CurrencyBatchConversionItem` / `CurrencyBatchConversionResult` / `ConvertAmountsBatchOptions` — application 层内部
- `BatchCurrencyConversionItem` / `ConvertAmountsBatchResult` — use-cases.ts 内部适配层
- `ConvertCurrencyInput`

---

## 文件结构映射

**创建：**
- `src/modules/currency/contracts.ts` — 存放 currency 模块的公共 DTO 类型
- `src/modules/currency/contracts.test.ts` — 验证公共类型可正确导入

**修改：**
- `src/modules/currency/actions.ts` — 移除 `BatchConversionItem`、`BatchConvertCurrencyResult` 内联定义，改为从 contracts.ts 导入并 re-export
- `src/modules/currency/use-cases.ts` — 移除 `BatchConvertCurrencyResult` 内联定义，改为从 contracts.ts 导入

**删除（空目录噪音）：**
- `src/modules/task-queue/server-actions/`（空目录）
- `tests/unit/features/` 下所有空的 leaf 目录
- `tests/unit/modules/task-queue/`（空目录）

---

## Chunk 1：currency 模块补齐 contracts.ts

### Task 1: 创建 contracts.ts 并整合公共 DTO 类型

**文件：**
- 创建：`src/modules/currency/contracts.ts`
- 创建：`src/modules/currency/contracts.test.ts`
- 修改：`src/modules/currency/actions.ts`
- 修改：`src/modules/currency/use-cases.ts`

- [ ] **Step 1：写验证 contracts 导入路径的测试**

  创建 `src/modules/currency/contracts.test.ts`：

  ```typescript
  import type { ConvertCurrencyResult, BatchConversionItem, BatchConvertCurrencyResult } from "./contracts";

  describe("currency contracts exports", () => {
    it("exports ConvertCurrencyResult", () => {
      const result: ConvertCurrencyResult = { converted: 42 };
      expect(typeof result.converted).toBe("number");
    });

    it("exports BatchConversionItem", () => {
      const item: BatchConversionItem = { amount: 100, currency: "USD" };
      expect(typeof item.amount).toBe("number");
      expect(item.date).toBeUndefined();
    });

    it("exports BatchConvertCurrencyResult", () => {
      const result: BatchConvertCurrencyResult = { results: [1, 2, 3] };
      expect(result.results).toHaveLength(3);
    });
  });
  ```

- [ ] **Step 2：运行测试，确认因模块不存在而失败**

  ```bash
  npx vitest run src/modules/currency/contracts.test.ts
  ```

  预期：FAIL，报错 `Cannot find module './contracts'`

- [ ] **Step 3：创建 `src/modules/currency/contracts.ts`**

  `ConvertCurrencyResult` 的真实来源是 `application/use-cases/convert-currency.ts`，此处 re-export：

  ```typescript
  export type { ConvertCurrencyResult } from "./application/use-cases/convert-currency";

  export interface BatchConversionItem {
    amount: number;
    currency: string;
    date?: string;
  }

  export interface BatchConvertCurrencyResult {
    results: number[];
  }
  ```

- [ ] **Step 4：运行测试，确认通过**

  ```bash
  npx vitest run src/modules/currency/contracts.test.ts
  ```

  预期：PASS（3 tests passed）

- [ ] **Step 5：修改 `actions.ts`，移除内联类型，改为从 contracts.ts 导入**

  在 `src/modules/currency/actions.ts` 中：
  1. 删除 `BatchConversionItem` 和 `BatchConvertCurrencyResult` 两个 interface 定义
  2. 在文件顶部添加并 re-export：
     ```typescript
     import type { BatchConversionItem, BatchConvertCurrencyResult } from "./contracts";
     export type { BatchConversionItem, BatchConvertCurrencyResult };
     ```

- [ ] **Step 6：修改 `use-cases.ts`，移除 `BatchConvertCurrencyResult` 内联定义**

  在 `src/modules/currency/use-cases.ts` 中：
  1. 删除 `BatchConvertCurrencyResult` 的 interface 定义
  2. 添加 import：
     ```typescript
     import type { BatchConvertCurrencyResult } from "./contracts";
     ```

- [ ] **Step 7：运行 currency 模块全量测试，确认无回归**

  ```bash
  npx vitest run src/modules/currency
  ```

  预期：所有测试 PASS

- [ ] **Step 8：TypeScript 类型检查**

  ```bash
  npx tsc --noEmit
  ```

  预期：无类型错误

- [ ] **Step 9：Commit**

  ```bash
  git add src/modules/currency/contracts.ts src/modules/currency/contracts.test.ts src/modules/currency/actions.ts src/modules/currency/use-cases.ts
  git commit -m "refactor(currency): extract public DTO types into contracts.ts"
  ```

---

## Chunk 2：清理空目录噪音

### Task 2: 删除重构遗留的空目录

**背景：** 最近几次重构（`refactor: remove src types shim layers`、`refactor(tests): unify unit test directory naming`）留下了若干空目录，纯粹是结构噪音。

- [ ] **Step 1：确认各目录无文件**

  ```bash
  find tests/unit/features tests/unit/modules/task-queue src/modules/task-queue/server-actions -type f 2>/dev/null
  ```

  预期：**无任何输出**。如果有文件输出，该目录不能删除，停止并检查。

- [ ] **Step 2：删除空 leaf 目录**

  ```bash
  find tests/unit/features tests/unit/modules/task-queue src/modules/task-queue/server-actions -type d -empty -delete
  ```

  此命令只删除**空的叶子目录**，有任何文件的目录不受影响。

- [ ] **Step 3：验证项目完整性**

  ```bash
  npx vitest run
  ```

  预期：所有测试 PASS，无测试因路径变更而失败。

- [ ] **Step 4：Commit**

  ```bash
  git add -A
  git commit -m "chore: remove empty directories left over from refactoring"
  ```

---

## 验证

完成所有任务后，执行完整验证：

```bash
# 1. 全量测试
npx vitest run

# 2. 类型检查
npx tsc --noEmit

# 3. Lint
npm run lint

# 4. 确认 currency 模块结构完整
ls src/modules/currency/contracts.ts

# 5. 确认公共类型从 contracts.ts 正确导出
grep -r 'from.*currency/contracts' src/
```

预期：测试全绿，TypeScript 无错，lint 通过，`src/modules/currency/contracts.ts` 存在，空目录已清理。
