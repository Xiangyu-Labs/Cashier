# Cashier 编码模式手册

> 本文档记录项目中所有已确立的编码模式（pattern）。所有 agent 在修改现有代码或新增功能时，必须严格遵循本文档中的约定。如需引入新模式，应先在此更新，再动代码。

---

## 1. 模块结构

每个 `src/modules/{domain}/` 目录的标准布局：

```
src/modules/{domain}/
├── actions.ts          # 公共 server action 入口（re-export server-actions/ 中的函数）
├── contracts.ts        # 公共 DTO 和类型（只有类型，无逻辑）
├── use-cases.ts        # 可选，纯 re-export barrel（聚合 application/* 的导出）
├── queries.ts          # 可选，纯 re-export barrel（聚合 application/queries/ 的导出）
├── tasks.ts            # 可选，纯 re-export barrel（聚合 application/tasks/ 的导出）
├── access.ts           # 可选，withXxxAccess / requireXxxAccess 鉴权 wrapper
├── application/        # 业务逻辑，私有
│   ├── use-cases/      # 每个用例一个文件
│   ├── queries/        # 只读查询
│   ├── tasks/          # 后台任务定义
│   └── services/       # 跨用例的共享服务
├── server-actions/     # 鉴权 + 输入校验边界，调用 application/
├── ui/                 # 模块私有 UI 组件
└── hooks/              # 模块私有 client hooks
```

### 关键约束

- **`use-cases.ts` / `queries.ts` / `tasks.ts` 是纯 barrel**：只能 `export { ... } from "./application/..."`，绝对不允许在这些文件中定义类型、实现逻辑、或封装函数签名。
- **`contracts.ts` 只放类型**：公共 DTO 和 Zod schema 放在 `contracts.ts` 或 `contract-schemas.ts`，不允许在 `actions.ts` 或 `use-cases.ts` 中内联定义应对外暴露的类型。
- **跨模块只通过公共入口导入**：只允许 import `@/modules/{domain}/actions`、`@/modules/{domain}/contracts`、`@/modules/{domain}/use-cases` 等顶层文件；不允许 deep import `@/modules/{domain}/application/...`、`@/modules/{domain}/server-actions/...`。
- **application/ 不依赖 actions/server-actions**：业务逻辑方向是单向的：`server-actions → application`，反过来不允许。

---

## 2. Server Actions

所有数据变更通过 Server Actions 进行，不使用 Route Handlers（Route Handlers 仅用于 NextAuth 和 v1 公开 API）。

### 模式

```typescript
// server-actions/create.ts
"use server";
import { withLedgerAccess } from "../access";
import { createLedgerEntryInputSchema } from "../contract-schemas";
import { createLedgerEntryWithConversion } from "../use-cases";
import type { LedgerEntryDto } from "../contracts";

export const createLedgerEntryAction = withLedgerAccess(
  async (ledgerId: string, data: CreateLedgerEntryInput): Promise<LedgerEntryDto> => {
    const validated = createLedgerEntryInputSchema.parse(data);
    return createLedgerEntryWithConversion({ ledgerId, ...validated });
  }
);
```

### 规则

- **直接 throw，不返回 `{ success, error }`**：Server Action 抛出错误，调用方捕获。
- **输入校验用 Zod**：在 server-action 层用 `schema.parse()` 校验，不在 application/ 层重复校验。
- **鉴权用 `withLedgerAccess`**：所有需要 ledger 访问权限的 action 必须通过此 wrapper，不允许在业务逻辑中手动调用 `getSession()`。
- **`actions.ts` 是 re-export barrel**：模块根目录的 `actions.ts` 只 re-export `server-actions/` 中的函数，不直接实现逻辑。

---

## 3. 错误处理

### Server Action / Use Case

```typescript
import { ValidationError, NotFoundError, ForbiddenError } from "@/lib/errors";

// 直接 throw，不包装
if (!isValid(data)) {
  throw new ValidationError("Invalid input", { field: "amount" });
}
if (!entity) {
  throw new NotFoundError("LedgerEntry");
}
```

### API Route Handler

```typescript
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";

export async function POST(request: Request) {
  try {
    // ...
  } catch (error) {
    logError("api/my-endpoint", error);
    return NextResponse.json(toErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
```

### 错误类层级

| 类 | HTTP | code |
|---|---|---|
| `AppError` | 500 | 自定义 |
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `RateLimitError` | 429 | `RATE_LIMIT` |

---

## 4. Query Keys

所有 TanStack Query key 必须通过 `src/lib/query-keys.ts` 中的 `queryKeys` 工厂定义，不允许硬编码字符串数组。

```typescript
import { queryKeys, invalidateLedgerEntries, invalidateLedgerStats } from "@/lib/query-keys";

// 读取
useQuery({ queryKey: queryKeys.ledgerEntries(ledgerId, filter) })

// invalidation（用 predicate，不用前缀匹配）
queryClient.invalidateQueries({ predicate: invalidateLedgerEntries(ledgerId) })
```

### 规则

- **新增数据类型时，先在 `queryKeys` 工厂中注册 key**，再在组件中使用。
- **invalidation 用 predicate 函数**（`invalidateLedgerEntries(ledgerId)` 等），不用 `queryKey` 前缀匹配。
- **`invalidateQueries` 放在 `onSettled`**，不放在 `onSuccess`，确保出错时也能刷新缓存。

---

## 5. Mutations 与乐观更新

所有数据变更 hook 必须使用 `useLedgerMutation` factory。

```typescript
import { useLedgerMutation, optimisticallyUpdateInList } from "@/lib/mutations/use-ledger-mutation";
import { queryKeys, invalidateLedgerEntries } from "@/lib/query-keys";
import { updateLedgerEntryAction } from "@/modules/ledger/actions";

export function useUpdateEntry(ledgerId: string) {
  return useLedgerMutation({
    ledgerId,
    mutationFn: (variables) => updateLedgerEntryAction(ledgerId, variables.id, variables.data),
    successMessage: t("updated"),
    invalidatePredicates: [invalidateLedgerEntries(ledgerId)],
    onOptimisticUpdate: (queryClient, variables) =>
      optimisticallyUpdateInList(
        queryClient,
        queryKeys.ledgerEntries(ledgerId),
        variables.id,
        variables.data
      ),
  });
}
```

### 规则

- **禁止手动 `useState` 做乐观状态**，统一用 `onOptimisticUpdate` + 自动 rollback。
- **`cancelQueries` 在 `onMutate` 中自动执行**（factory 处理），无需手动调用。
- **rollback 用 snapshots**：`optimisticallyUpdateInList` / `optimisticallyAddToList` 返回 `{ snapshots }`，factory 在 `onError` 中自动还原。
- **`invalidateQueries` 在 `onSettled` 中执行**（factory 处理），无需手动调用。

---

## 6. 后台任务（Task Handlers）

### 任务定义

```typescript
// src/modules/{domain}/application/tasks/my-task.ts
import type { FlowTaskHandler } from "@/lib/flow/types";

const handler: FlowTaskHandler<MyTaskInput, MyTaskOutput> = {
  async execute(input, context) {
    // 业务逻辑
    return result;
  },
};

export const myTaskDefinition = {
  type: "my_task" as const,
  handler,
};
```

### 注册

任务只能在 `src/lib/flow/task-registry.ts` 中注册，通过 `registerTaskIfNeeded(engine, type, handler)` 注册，不允许在其他地方调用 `engine.register()`。

### 提交

```typescript
import { flowEngine } from "@/lib/flow";
flowEngine.submit("my_task", input, { deduplicationKey: `my_task:${entityId}` });
```

- **`deduplicationKey` 必须是 engine 的一等字段**，不允许藏在 `input` payload 中。

---

## 7. 数据访问与租户隔离

- **所有数据查询必须通过 `forLedger(ledgerId)` 范围化**，不允许无 tenant scope 的全表查询。
- **Schema 来源唯一**：`src/persistence/schema/*.ts` 是 Drizzle schema 的唯一来源，`src/app` 和共享 UI 不得直接 import `@/persistence`。
- **软删除**：所有主要表有 `deletedAt` 列，查询时必须过滤 `IS NULL`。
- **日期存储为字符串**：业务日期存为 `yyyy-MM-dd` 字符串，不存时间戳。系统时间戳（`createdAt` 等）用整数。前端负责时区转换。

---

## 8. 状态管理

| 状态类型 | 工具 | 说明 |
|---|---|---|
| 服务端数据 | TanStack Query | 缓存、invalidation、乐观更新 |
| 全局轻量客户端状态 | Zustand | 仅用于 modal stack 等极少数场景 |
| 本地组件状态 | `useState` / `useReducer` | 纯 UI 交互状态，不跨组件共享 |

---

## 9. 组件与 Hook 规范

- **组件文件 ≤ 300-400 行**：超出时提取 custom hook 或拆分子组件。
- **Hook 文件 ≤ 200 行**：超出时组合更小的 hook。
- **module-specific hook 放在 `src/modules/{domain}/hooks/`**；跨模块共享 hook 放在 `src/hooks/`。
- **加载状态用 Skeleton，不用 Spinner**。
- **图标用 Lucide React**。
- **Inline editing 优于 modal editing**（简单字段直接内联编辑）。

### App 层保持 thin

`src/app` 的 `page.tsx` 只负责：路由、鉴权检查、数据注水（prefetch）、将 props 传入模块 UI。业务逻辑、数据访问、状态管理均在模块层处理，不在 page 中实现。

---

## 10. i18n

- 翻译文件在 `messages/en.json` 和 `messages/zh.json`。
- 所有用户可见文字必须通过 `useTranslations()` 获取，不允许硬编码中英文字符串。
- 新增功能时，中英文翻译必须同步添加，不允许只加一种语言。
- 路由使用 `[locale]` 前缀，`localePrefix='always'`。

---

## 11. 测试规范

- **测试使用内存 SQLite**（`:memory:`），不需要外部数据库。
- **优先集成测试**：业务逻辑优先写集成测试，单元测试覆盖纯函数工具。
- **`fileParallelism: false`**：vitest 配置，保证数据库一致性。
- **测试文件放在 `tests/unit/` 或 `tests/integration/`**，不放在 `src/` 内（已有的 `*.test.ts` 在模块根级是历史遗留，新测试不应延续此模式）。
- **测试数据用 factories**：`tests/helpers/factories.ts` 中的 `createTestUser`、`createTestLedger` 等，不在测试中硬编码 ID 或数据结构。
- **Global mock 在 `tests/setup.ts`**：`@/lib/db`、`@/auth`、`next-intl`、`next/cache` 已全局 mock，测试中无需重复 mock。
- **修复 bug 先写测试复现**：先写能复现 bug 的测试，确认测试失败后再修复。

---

## 12. 禁止模式（Anti-patterns）

| 禁止 | 原因 | 替代方案 |
|---|---|---|
| Server Action 返回 `{ success, error }` | 非项目约定 | 直接 throw |
| 在 `use-cases.ts` 中定义类型或实现逻辑 | barrel 职责混乱 | 移入 `application/use-cases/` |
| 跨模块 deep import（`@/modules/ledger/application/...`） | 破坏封装 | 通过模块公共入口 |
| 手动 `useState` 做乐观更新 | 与 factory 冲突 | `useLedgerMutation` + `onOptimisticUpdate` |
| `invalidateQueries` 放在 `onSuccess` | 出错时缓存不刷新 | 放在 `onSettled` |
| 硬编码 query key 字符串 | 无法统一 invalidation | `queryKeys` 工厂 |
| 存储日期为时间戳 | 时区问题 | `yyyy-MM-dd` 字符串 |
| 在 `src/app` 中写业务逻辑 | 违反 thin app 原则 | 移入对应模块 `application/` |
| `engine.register()` 在 task-registry 之外调用 | 注册入口分散 | 只在 `task-registry.ts` 注册 |
| 用 Spinner 表示加载 | 与 UX 规范不符 | Skeleton |
