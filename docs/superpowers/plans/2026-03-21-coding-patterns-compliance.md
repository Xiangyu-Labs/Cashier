# Coding Patterns Compliance 修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 deep review 发现的所有违反 `docs/architecture/coding-patterns.md` 规范的问题。

**Architecture:** 共 5 组独立修复，按优先级排列：(1) server-action 鉴权边界补全，(2) actions.ts barrel 清理，(3) use-cases.ts barrel 类型清理，(4) query key 工厂补全，(5) application 层标准错误类替换。每组修复互相独立，可单独提交。

**Tech Stack:** Next.js App Router Server Actions, TanStack Query, Zod, `src/lib/errors.ts` 标准错误类

---

## 涉及文件清单

| 操作 | 文件 | 说明 |
|---|---|---|
| Modify | `src/modules/ledger/server-actions/get-entry.ts` | 加鉴权包装 |
| Modify | `src/modules/source-document/server-actions/get-document-light.ts` | 加鉴权包装 |
| Modify | `src/modules/source-document/actions.ts` | 移除 `export type` 块 |
| Modify | `src/modules/task-queue/actions.ts` | 移除 `export type` 块 |
| Modify | `src/modules/ledger/use-cases.ts` | 移除 re-export 的类型，只保留函数 |
| Modify | `src/modules/ledger/contracts.ts` | 添加 `ExportLedgerEntriesOptions`、`ExportResult`、`CategorizeResult` 类型定义 |
| Modify | `src/lib/query-keys.ts` | 添加 `sourceDocumentFull` 工厂方法 |
| Modify | `src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx` | 改用 `queryKeys.sourceDocumentFull()` |
| Modify | `src/modules/ledger/application/tasks/generate-category-metadata.ts` | 改用标准错误类 |
| Modify | `src/modules/ledger/application/tasks/categorize-entry.ts` | 改用标准错误类 |
| Modify | `src/modules/ledger/application/queries/list-indexed-categories-for-categorization.ts` | 改用 `NotFoundError` |
| Modify | `src/modules/ledger/application/services/recalculate-entries-converted-amount.ts` | 改用 `AppError` |
| Modify | `src/modules/currency/application/use-cases/convert-currency.ts` | 改用 `ValidationError` |
| Modify | `src/modules/currency/application/use-cases/convert-amounts-batch.ts` | 改用 `AppError` |
| Modify | `src/modules/auth/application/use-cases/send-otp.ts` | 改用 `AppError` |
| Modify | `src/modules/auth/application/use-cases/authenticate-with-otp.ts` | 改用 `AppError` |
| Test | `tests/unit/modules/ledger/server-actions/get-entry.test.ts` | 新建，验证鉴权 |
| Test | `tests/unit/modules/source-document/server-actions/get-document-light.test.ts` | 新建，验证鉴权 |

---

## Task 1: 修复 `getLedgerEntryAction` 鉴权边界

**背景：** `src/modules/ledger/server-actions/get-entry.ts` 当前是裸 `async function`，没有 `withLedgerAccess` 包装。虽然 application 层 `getLedgerEntryDetail` 内部调用了 `requireLedgerAccess(entry.ledgerId)`，但鉴权应在 server-action 边界完成，而不是下沉到 application 层。此外，当前实现只接受 `id` 参数，没有 `ledgerId`，无法在 server-action 层提前鉴权——需要调整函数签名。

**Files:**
- Modify: `src/modules/ledger/server-actions/get-entry.ts`
- Modify: `src/modules/ledger/actions.ts`（签名变化需要同步）
- Modify: `src/modules/ledger/ui/LedgerEntryDetailWrapper.tsx`（调用方需要传 `ledgerId`）
- Create: `tests/unit/modules/ledger/server-actions/get-entry.test.ts`

- [ ] **Step 1: 写失败测试**

新建文件 `tests/unit/modules/ledger/server-actions/get-entry.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError } from "@/lib/errors";

// mock withLedgerAccess — 返回一个会 throw UnauthorizedError 的 wrapper
vi.mock("@/modules/ledger/access", () => ({
  withLedgerAccess: vi.fn((action) => {
    return async (ledgerId: string, ...args: unknown[]) => {
      if (ledgerId === "unauthorized-ledger") {
        throw new UnauthorizedError("Unauthorized");
      }
      return action(ledgerId, ...args);
    };
  }),
  requireLedgerAccess: vi.fn(),
}));

vi.mock("@/modules/ledger/queries", () => ({
  getLedgerEntryDetail: vi.fn().mockResolvedValue({ id: "entry-1", title: "Test" }),
}));

describe("getLedgerEntryAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws UnauthorizedError for unauthorized ledger", async () => {
    const { getLedgerEntryAction } = await import(
      "@/modules/ledger/server-actions/get-entry"
    );
    await expect(
      getLedgerEntryAction("unauthorized-ledger", "entry-1")
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns entry for authorized ledger", async () => {
    const { getLedgerEntryAction } = await import(
      "@/modules/ledger/server-actions/get-entry"
    );
    const result = await getLedgerEntryAction("valid-ledger", "entry-1");
    expect(result).toEqual({ id: "entry-1", title: "Test" });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/unit/modules/ledger/server-actions/get-entry.test.ts
```

预期：FAIL（`getLedgerEntryAction` 签名不匹配，只接受 1 个参数）

- [ ] **Step 3: 修改 `get-entry.ts`，加入鉴权包装**

将 `src/modules/ledger/server-actions/get-entry.ts` 改为：

```typescript
"use server";
import { withLedgerAccess } from "../access";
import { getLedgerEntryDetail } from "@/modules/ledger/queries";
import type { LedgerEntryDto } from "@/modules/ledger/contracts";

export const getLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, id: string): Promise<LedgerEntryDto | null> => {
    return getLedgerEntryDetail(id);
  }
);
```

> 注意：`withLedgerAccess` 的函数签名是 `(action: (ledgerId, ...args) => Promise<T>) => (ledgerId, ...args) => Promise<T>`，因此对外接口变为 `getLedgerEntryAction(ledgerId, id)`。

- [ ] **Step 3.5: 搜索 `getLedgerEntryAction` 的所有调用方**

```bash
grep -rn "getLedgerEntryAction" src/ --include="*.ts" --include="*.tsx"
```

确认所有调用方的签名，逐一更新为 `getLedgerEntryAction(ledgerId, id)`。

- [ ] **Step 4: 更新调用方 `LedgerEntryDetailWrapper.tsx`**

读取 `src/modules/ledger/ui/LedgerEntryDetailWrapper.tsx`，将调用处改为传入 `ledgerId`：

```typescript
// 修改前
queryFn: () => getLedgerEntryAction(id),

// 修改后（组件已有 ledgerId prop）
queryFn: () => getLedgerEntryAction(ledgerId, id),
```

确认 `LedgerEntryDetailWrapper` 组件的 props 中有 `ledgerId`，如无则需添加并检查所有调用方。

- [ ] **Step 5: 运行测试，确认通过**

```bash
npx vitest run tests/unit/modules/ledger/server-actions/get-entry.test.ts
```

预期：PASS

- [ ] **Step 6: 运行全量测试，确认无回归**

```bash
npm run test:run
```

预期：所有测试通过

- [ ] **Step 7: Commit**

```bash
git add src/modules/ledger/server-actions/get-entry.ts \
        src/modules/ledger/ui/LedgerEntryDetailWrapper.tsx \
        tests/unit/modules/ledger/server-actions/get-entry.test.ts
git commit -m "fix: add withLedgerAccess auth boundary to getLedgerEntryAction"
```

---

## Task 2: 修复 `getSourceDocumentLightAction` 鉴权边界

**背景：** `src/modules/source-document/server-actions/get-document-light.ts` 直接调用 application 层查询，未使用 `withSourceDocumentLedgerAccess`。application 层的 `getSourceDocumentLight` 通过 `getAccessibleSourceDocumentContext` 做了隐式访问控制，但鉴权应在 server-action 边界。当前签名只有 `id`，需调整为 `(ledgerId, id)`。

**Files:**
- Modify: `src/modules/source-document/server-actions/get-document-light.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocumentDetailData.ts`（调用方）
- Create: `tests/unit/modules/source-document/server-actions/get-document-light.test.ts`

- [ ] **Step 1: 写失败测试**

新建文件 `tests/unit/modules/source-document/server-actions/get-document-light.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthorizedError } from "@/lib/errors";

vi.mock("@/modules/source-document/server-actions/access", () => ({
  withSourceDocumentLedgerAccess: vi.fn((action) => {
    return async (ledgerId: string, ...args: unknown[]) => {
      if (ledgerId === "unauthorized-ledger") {
        throw new UnauthorizedError("Unauthorized or Ledger not found");
      }
      return action({ ledgerId }, ...args);
    };
  }),
}));

vi.mock(
  "@/modules/source-document/application/queries/get-source-document-light",
  () => ({
    getSourceDocumentLight: vi.fn().mockResolvedValue({ id: "doc-1" }),
  })
);

describe("getSourceDocumentLightAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws UnauthorizedError for unauthorized ledger", async () => {
    const { getSourceDocumentLightAction } = await import(
      "@/modules/source-document/server-actions/get-document-light"
    );
    await expect(
      getSourceDocumentLightAction("unauthorized-ledger", "doc-1")
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns document for authorized ledger", async () => {
    const { getSourceDocumentLightAction } = await import(
      "@/modules/source-document/server-actions/get-document-light"
    );
    const result = await getSourceDocumentLightAction("valid-ledger", "doc-1");
    expect(result).toEqual({ id: "doc-1" });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run tests/unit/modules/source-document/server-actions/get-document-light.test.ts
```

预期：FAIL

- [ ] **Step 2.5: 确认 `getSourceDocumentLight` 内部的租户隔离方式**

读取 `src/modules/source-document/application/queries/get-source-document-light.ts`，确认它通过 `getAccessibleSourceDocumentContext(sourceDocumentId)` 做了访问控制（内部验证 sourceDocument 归属），而非依赖外部传入的 `ledgerId`。因此 `getSourceDocumentLight(id)` 只需 `id` 参数，加了 `withSourceDocumentLedgerAccess` 后外层鉴权已满足要求，无需修改 application 查询签名。

- [ ] **Step 3: 修改 `get-document-light.ts`，加入鉴权包装**

```typescript
"use server";
import type { SourceDocumentLightWithEntriesDto } from "@/modules/source-document/contracts";
import { getSourceDocumentLight } from "../application/queries/get-source-document-light";
import { withSourceDocumentLedgerAccess } from "./access";
import type { SourceDocumentLedgerActionContext } from "./access";

export const getSourceDocumentLightAction = withSourceDocumentLedgerAccess(
  async (
    _context: SourceDocumentLedgerActionContext,
    id: string
  ): Promise<SourceDocumentLightWithEntriesDto | null> => {
    return getSourceDocumentLight(id);
  }
);
```

- [ ] **Step 4: 更新调用方 `useSourceDocumentDetailData.ts`**

读取 `src/modules/source-document/hooks/useSourceDocumentDetailData.ts`，将 `getSourceDocumentLightAction(id)` 改为 `getSourceDocumentLightAction(ledgerId, id)`。确认 hook 的入参中有 `ledgerId`，如无则添加。

- [ ] **Step 5: 运行测试，确认通过**

```bash
npx vitest run tests/unit/modules/source-document/server-actions/get-document-light.test.ts
```

- [ ] **Step 6: 全量测试**

```bash
npm run test:run
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/source-document/server-actions/get-document-light.ts \
        src/modules/source-document/hooks/useSourceDocumentDetailData.ts \
        tests/unit/modules/source-document/server-actions/get-document-light.test.ts
git commit -m "fix: add withSourceDocumentLedgerAccess auth boundary to getSourceDocumentLightAction"
```

---

## Task 3: 清理 `actions.ts` barrel 中的 `export type`

**背景：** `actions.ts` 只能 re-export `server-actions/` 中的函数。`source-document/actions.ts` 和 `task-queue/actions.ts` 中有 `export type { ... } from "./contracts"` 块，违反规范。消费方应直接从 `@/modules/{domain}/contracts` 导入类型。

**Files:**
- Modify: `src/modules/source-document/actions.ts`
- Modify: `src/modules/task-queue/actions.ts`

- [ ] **Step 1: 搜索受影响的导入方**

```bash
# 查找从 source-document/actions 导入类型的地方
grep -rn "from \"@/modules/source-document/actions\"" src/ --include="*.ts" --include="*.tsx"
grep -rn "from \"@/modules/task-queue/actions\"" src/ --include="*.ts" --include="*.tsx"
```

逐一检查每处导入，判断它导入的是函数还是类型。如果有文件通过 `actions` 导入类型，需改为从 `contracts` 直接导入。

- [ ] **Step 2: 更新导入方，将类型来源改为 contracts**

对于每个通过 `@/modules/source-document/actions` 或 `@/modules/task-queue/actions` 导入类型的文件，将类型的来源改为对应的 `contracts`：

```typescript
// 修改前
import { someAction, type SomeType } from "@/modules/source-document/actions";

// 修改后
import { someAction } from "@/modules/source-document/actions";
import type { SomeType } from "@/modules/source-document/contracts";
```

- [ ] **Step 3: 删除 `source-document/actions.ts` 中的 `export type` 块**

将 `src/modules/source-document/actions.ts` 第 26–46 行的 `export type { ... } from "./contracts"` 整块删除。

- [ ] **Step 4: 删除 `task-queue/actions.ts` 中的 `export type` 块**

将 `src/modules/task-queue/actions.ts` 第 10–18 行的 `export type { ... } from "./contracts"` 整块删除。

- [ ] **Step 5: 运行构建，确认无 TypeScript 错误**

```bash
npm run build 2>&1 | head -50
```

预期：无类型错误

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/actions.ts \
        src/modules/task-queue/actions.ts
git commit -m "fix: remove export type from actions.ts barrels, types should be imported from contracts directly"
```

---

## Task 4: 清理 `ledger/use-cases.ts` barrel 中的类型 re-export

**背景：** `src/modules/ledger/use-cases.ts` 通过 `export { ..., type ExportLedgerEntriesOptions, type ExportResult }` 和 `export { ..., type CategorizeResult }` 暴露了来自 `application/` 的类型。规范要求 `use-cases.ts` 是纯函数 barrel，类型应在 `contracts.ts` 中定义。

**Files:**
- Modify: `src/modules/ledger/use-cases.ts`
- Modify: `src/modules/ledger/contracts.ts`
- Modify: `src/modules/ledger/application/use-cases/export-ledger-entries.ts`
- Modify: `src/modules/ledger/application/use-cases/submit-categorize-tasks.ts`

- [ ] **Step 1: 搜索三个类型的所有使用方**

```bash
grep -rn "ExportLedgerEntriesOptions\|ExportResult\|CategorizeResult" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: 将三个类型在 `contracts.ts` 中本地重新定义**

**策略：`contracts.ts` 不能 import `application/` 层，因此必须在 `contracts.ts` 中独立定义这些类型（不是 re-export，而是本地定义副本）。`application/` 层保留自己的类型定义不变，两者内容一致但各自独立。这是最小侵入性的方案，避免循环依赖。**

读取 `src/modules/ledger/application/use-cases/export-ledger-entries.ts` 和 `submit-categorize-tasks.ts`，将 `ExportResult`、`ExportLedgerEntriesOptions`、`CategorizeResult` 的接口定义复制到 `src/modules/ledger/contracts.ts` 末尾（本地定义，不 import）：

```typescript
// 在 src/modules/ledger/contracts.ts 末尾追加
export interface ExportResult {
  // 复制 export-ledger-entries.ts 中的完整定义
}

export interface ExportLedgerEntriesOptions {
  // 复制 export-ledger-entries.ts 中的完整定义
}

export type CategorizeResult = {
  // 复制 submit-categorize-tasks.ts 中的完整定义
};
```

- [ ] **Step 3: `application/` 层保留原有类型定义不变**

`export-ledger-entries.ts` 和 `submit-categorize-tasks.ts` 中的类型定义**保持原样**，不需要修改（它们是 application 层的内部实现，`contracts.ts` 是公共接口的独立定义）。

- [ ] **Step 4: 从 `use-cases.ts` 移除类型 re-export**

```typescript
// 修改前
export {
  exportLedgerEntries,
  type ExportLedgerEntriesOptions,
  type ExportResult,
} from "./application/use-cases/export-ledger-entries";
export {
  submitAutoCategorize,
  submitBatchCategorize,
  type CategorizeResult,
} from "./application/use-cases/submit-categorize-tasks";

// 修改后
export { exportLedgerEntries } from "./application/use-cases/export-ledger-entries";
export {
  submitAutoCategorize,
  submitBatchCategorize,
} from "./application/use-cases/submit-categorize-tasks";
```

- [ ] **Step 5: 更新所有通过 `use-cases` 导入这三个类型的调用方**

```bash
grep -rn "from \"@/modules/ledger/use-cases\"" src/ --include="*.ts" --include="*.tsx"
```

将导入了 `ExportLedgerEntriesOptions`、`ExportResult`、`CategorizeResult` 的文件改为从 `@/modules/ledger/contracts` 导入。

- [ ] **Step 6: 运行构建和测试**

```bash
npm run build 2>&1 | head -50
npm run test:run
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/ledger/use-cases.ts \
        src/modules/ledger/contracts.ts \
        src/modules/ledger/application/use-cases/export-ledger-entries.ts \
        src/modules/ledger/application/use-cases/submit-categorize-tasks.ts
git commit -m "fix: move ExportResult/ExportLedgerEntriesOptions/CategorizeResult to contracts.ts, keep use-cases.ts as pure function barrel"
```

---

## Task 5: 补全 `queryKeys.sourceDocumentFull` 工厂并替换硬编码 key

**背景：** `src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx:43` 使用了硬编码的 query key `["sourceDocument", "full", ledgerId, sourceDocument.id]`，而 `src/lib/query-keys.ts` 中没有对应的工厂方法。

**Files:**
- Modify: `src/lib/query-keys.ts`
- Modify: `src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx`

- [ ] **Step 0: 确认硬编码 key 的 shape，写一个 inline 验证**

当前硬编码 key 是 `["sourceDocument", "full", ledgerId, sourceDocument.id]`（来自 `SourceDocumentEditRetryDialog.tsx:43`）。工厂方法需要输出完全相同的 tuple，执行完后用 TypeScript 编译器验证（Step 3 的 build 步骤）即可代替单元测试，因为工厂是纯函数且 `as const` 类型由编译器保证。

- [ ] **Step 1: 在 `query-keys.ts` 中添加 `sourceDocumentFull` 工厂**

在 `src/lib/query-keys.ts` 的 `sourceDocumentLight` 定义之后添加：

```typescript
sourceDocumentFull: (ledgerId: string, id: string) =>
  ["sourceDocument", "full", ledgerId, id] as const,
```

- [ ] **Step 2: 在 `SourceDocumentEditRetryDialog.tsx` 中替换硬编码 key**

```typescript
// 修改前（第 43 行）
queryKey: ["sourceDocument", "full", ledgerId, sourceDocument.id],

// 修改后
import { queryKeys } from "@/lib/query-keys";
// ...
queryKey: queryKeys.sourceDocumentFull(ledgerId, sourceDocument.id),
```

- [ ] **Step 3: 运行构建和测试**

```bash
npm run build 2>&1 | head -30
npm run test:run
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/query-keys.ts \
        src/modules/source-document/ui/SourceDocumentEditRetryDialog.tsx
git commit -m "fix: add sourceDocumentFull to queryKeys factory, replace hardcoded query key"
```

---

## Task 6: 替换 `application/` 层的原始 `Error` 为标准错误类

**背景：** 多个 application 层文件使用 `throw new Error(...)` 而非项目标准错误类（`ValidationError`、`NotFoundError`、`AppError`）。

**Files:**
- Modify: `src/modules/currency/application/use-cases/convert-currency.ts`
- Modify: `src/modules/currency/application/use-cases/convert-amounts-batch.ts`
- Modify: `src/modules/ledger/application/tasks/generate-category-metadata.ts`
- Modify: `src/modules/ledger/application/tasks/categorize-entry.ts`
- Modify: `src/modules/ledger/application/queries/list-indexed-categories-for-categorization.ts`
- Modify: `src/modules/ledger/application/services/recalculate-entries-converted-amount.ts`
- Modify: `src/modules/auth/application/use-cases/send-otp.ts`
- Modify: `src/modules/auth/application/use-cases/authenticate-with-otp.ts`

- [ ] **Step 1: 确认标准错误类签名**

```bash
grep -n "export class\|export function\|constructor" src/lib/errors.ts
```

- [ ] **Step 2: 修改 `convert-currency.ts`**

```typescript
// 修改前
throw new Error("Missing required parameters");
// 修改后
import { ValidationError } from "@/lib/errors";
throw new ValidationError("Missing required parameters");
```

- [ ] **Step 3: 修改 `convert-amounts-batch.ts`**

读取文件，将 `throw new Error(...)` 改为 `AppError` 或 `ValidationError`（视上下文而定）。

- [ ] **Step 4: 修改 `generate-category-metadata.ts` 和 `categorize-entry.ts`**

将参数校验的 `throw new Error("Missing ...")` 改为 `throw new ValidationError(...)`。

- [ ] **Step 5: 修改 `list-indexed-categories-for-categorization.ts`**

```typescript
// 修改前
throw new Error("No categories available");
// 修改后
import { NotFoundError } from "@/lib/errors";
throw new NotFoundError("No categories available");
```

- [ ] **Step 6: 修改 `recalculate-entries-converted-amount.ts`**

将 `throw new Error("Missing conversion result...")` 改为 `throw new AppError(...)`。`throw new Error("SUPERSEDED")` 改为 `throw new AppError("SUPERSEDED", "SUPERSEDED")`（或项目约定的写法）。

- [ ] **Step 7: 修改 `send-otp.ts` 和 `authenticate-with-otp.ts`**

将 `throw new Error("Failed to...")` 改为 `throw new AppError(...)`。

- [ ] **Step 8: 运行全量测试**

```bash
npm run test:run
```

预期：所有测试通过。若有失败，检查 catch 块是否依赖 `error.message` 的具体字符串，对应调整。

- [ ] **Step 9: Commit**

```bash
git add src/modules/currency/application/use-cases/convert-currency.ts \
        src/modules/currency/application/use-cases/convert-amounts-batch.ts \
        src/modules/ledger/application/tasks/generate-category-metadata.ts \
        src/modules/ledger/application/tasks/categorize-entry.ts \
        src/modules/ledger/application/queries/list-indexed-categories-for-categorization.ts \
        src/modules/ledger/application/services/recalculate-entries-converted-amount.ts \
        src/modules/auth/application/use-cases/send-otp.ts \
        src/modules/auth/application/use-cases/authenticate-with-otp.ts
git commit -m "fix: replace raw Error with standard error classes in application layer"
```

---

## 执行顺序建议

| 顺序 | Task | 原因 |
|---|---|---|
| 1 | Task 1 + Task 2（并行） | 安全问题，优先修复 |
| 2 | Task 5 | 改动最小，独立 |
| 3 | Task 3 | 需搜索所有导入方 |
| 4 | Task 4 | 依赖理解 contracts 边界 |
| 5 | Task 6 | 逐文件修改，可拆分多次 commit |
