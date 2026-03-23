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
- **`actions.ts` 是纯 re-export barrel**：模块根目录的 `actions.ts` 只能 re-export `server-actions/` 中的函数，绝对不允许在其中直接实现函数体或定义类型。逻辑必须放在 `server-actions/` 子目录。
- **`contracts.ts` 只放本地类型定义**：公共 DTO 和 Zod schema 放在 `contracts.ts` 或 `contract-schemas.ts`。不允许在 `contracts.ts` 中 `import` 或 `re-export` `application/` 层的内部类型——所有类型必须在 `contracts.ts` 内本地定义，或通过 `use-cases.ts` barrel 暴露。
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

使用 `src/lib/errors.ts` 中的标准化错误类。

```typescript
import { ValidationError, UnauthorizedError, NotFoundError } from "@/lib/errors";
import { toErrorResponse, getErrorStatusCode, logError } from "@/lib/error-handlers";

// Server Actions — 直接 throw
export async function myAction(data: unknown) {
  if (!isValid(data)) {
    throw new ValidationError("Invalid input", { field: "email" });
  }
}

// API Routes — 用标准化响应
export async function POST(request: Request) {
  try {
    // ... logic
  } catch (error) {
    logError("api/my-endpoint", error);
    return NextResponse.json(toErrorResponse(error), { status: getErrorStatusCode(error) });
  }
}
```

### 错误类

| 类 | HTTP 状态码 | 用途 |
|---|---|---|
| `ValidationError` | 400 | 输入校验失败 |
| `UnauthorizedError` | 401 | 未登录 |
| `ForbiddenError` | 403 | 无权限 |
| `NotFoundError` | 404 | 资源不存在 |
| `RateLimitError` | 429 | 请求频率超限 |
| `AppError` | 500 | 通用业务错误基类 |

---

## 4. Query Keys

使用 `src/lib/query-keys.ts` 中的集中式 `queryKeys` 工厂，不允许硬编码字符串数组。

```typescript
import { queryKeys } from "@/lib/query-keys";

// 正确
const { data } = useQuery({
  queryKey: queryKeys.ledger(ledgerId).entries(),
});

// 错误 ❌
const { data } = useQuery({
  queryKey: ["ledger", ledgerId, "entries"],
});
```

### 缓存失效

```typescript
// 使用 invalidateLedgerCache predicate 批量失效
queryClient.invalidateQueries({
  predicate: invalidateLedgerCache(ledgerId),
});
```

---

## 5. Mutations 与乐观更新

所有 mutations 使用 `useLedgerMutation` 工厂（`src/lib/mutations/`），不直接使用 `useMutation`。

```typescript
const mutation = useLedgerMutation({
  mutationFn: ({ ledgerId, data }) => createLedgerEntryAction(ledgerId, data),
  onOptimisticUpdate: ({ ledgerId, data }, queryClient) => {
    // 返回 rollback 函数
    const previous = queryClient.getQueryData(queryKeys.ledger(ledgerId).entries());
    queryClient.setQueryData(queryKeys.ledger(ledgerId).entries(), (old) => [
      ...(old ?? []),
      optimisticEntry(data),
    ]);
    return () => queryClient.setQueryData(queryKeys.ledger(ledgerId).entries(), previous);
  },
});
```

### 规则

- **`invalidateQueries` 放在 `onSettled`**，不放在 `onSuccess`，确保出错时缓存也能刷新。
- **禁止用 `useState` 做乐观更新**，统一通过 `onOptimisticUpdate` + TanStack Query cache 管理。
- **`cancelQueries` 在 `onOptimisticUpdate` 前调用**，防止竞态。

---

## 6. 后台任务

后台任务使用 in-process `flowEngine`（`src/lib/flow/`），不使用外部队列。

```typescript
// src/modules/my-feature/application/tasks/my-task.ts
import { flowEngine } from "@/lib/flow";

export default function register(engine: typeof flowEngine) {
  engine.register("my-task", {
    async execute(input, context) {
      // 任务逻辑
      return result;
    },
  });
}
```

### 规则

- **只在 `src/lib/flow/task-registry.ts` 注册任务**，不在其他地方调用 `engine.register()`。
- **用 `deduplicationKey`** 防止同一任务重复提交。
- **提交任务用 `flowEngine.submit()`**，在 server-action 或 use-case 中调用。

---

## 7. 数据访问与租户隔离

所有数据查询必须通过 `forLedger(ledgerId)` 作用域，不允许全局查询后在内存中过滤。

```typescript
import { forLedger } from "@/lib/db";

export async function listLedgerEntries(ledgerId: string) {
  const db = forLedger(ledgerId);
  return db.query.ledgerEntries.findMany({
    where: (t, { isNull }) => isNull(t.deletedAt),
  });
}
```

### 规则

- **软删除**：所有主表有 `deletedAt` 列，删除时设置时间戳而非物理删除，查询时过滤 `isNull(t.deletedAt)`。
- **日期存 `yyyy-MM-dd` 字符串**：不存时间戳，前端负责时区处理，后端做字符串比较。
- **SQL 层过滤，不在内存中过滤**：分页、状态筛选、日期范围都在 SQL 层完成。

---

## 8. 状态管理

- **TanStack Query**：管理所有服务端状态（列表、详情、统计）。
- **Zustand**：只管轻量客户端状态（modal stack、UI 开关），不用来缓存服务端数据。
- **Smart Polling**：用 `useSmartPolling`（`src/hooks/use-smart-polling.ts`）监控异步任务，不手动 `setInterval`。

---

## 9. 组件与 Hook 规则

- **组件文件 300-400 行上限**：超出时提取自定义 hook。
- **Hook 200 行上限**：超出时拆分为更小的 hook 组合。
- **模块私有 hook 放在 `src/modules/{domain}/hooks/`**，跨模块共用 hook 放在 `src/hooks/`。
- **加载状态用 Skeleton，不用 Spinner**。
- **图标用 Lucide React**。
- **内联编辑优先于弹窗编辑**（简单字段场景）。

---

## 10. i18n

使用 `next-intl`，所有用户可见文字必须国际化。

```typescript
// Server Component
import { getTranslations } from "next-intl/server";
const t = await getTranslations("LedgerPage");

// Client Component
import { useTranslations } from "next-intl";
const t = useTranslations("LedgerPage");
```

- 消息文件在 `messages/en.json` 和 `messages/zh.json`。
- Key 命名：`模块.组件.描述`，如 `LedgerPage.emptyState.title`。
- 不允许在组件中硬编码中文或英文字符串。

---

## 11. 测试

### 测试分层

- **测试只放在 `tests/` 下**：新测试只能放在 `tests/unit/` 或 `tests/integration/`；不要再把新测试放进 `src/`。
- **新增模块归属的 unit test 一律放在 `tests/unit/modules/*`**：不要再把新的模块测试加到 `tests/unit/auth/*`、`tests/unit/ledger/*` 这类旧路径。
- **旧路径模块测试只允许按 grandfathered allowlist 保留**：`tests/tooling/legacy-unit-test-allowlist.ts` 只能缩小，不能新增；触达旧测试时优先迁到 `tests/unit/modules/*`。
- **`unit` 与 `integration` 必须严格分离**：`npm run test:unit` 只能跑单元测试和 governance 测试，绝对不允许通过泛化 glob 把 `tests/integration/**` 混进来。
- **`npm run test:integration` 只跑集成测试**：集成测试保持真实边界覆盖，不要为了提速把它们偷偷降级成 mock-heavy unit test。
- **governance 测试单独对待**：像 ESLint / 架构约束这类扫描型测试属于 `unit` 的 governance 子类，可以独立调度，但仍归 `test:unit` 管理。

### Vitest 配置与 setup 约定

- **共享配置在 `vitest.shared.config.ts`**：alias、coverage、project 公共选项统一从这里出，不要在多个 Vitest 配置里手抄一份。
- **入口配置固定为三份**：
  - `vitest.config.ts`：全量入口，聚合 unit + integration projects。
  - `vitest.unit.config.ts`：只包含 unit 相关 projects。
  - `vitest.integration.config.ts`：只包含 integration 相关 projects。
- **公共 mock 放在 `tests/setup.common.ts`**：`@/auth`、`next-intl`、`next/image`、`next/cache` 这类与数据库无关的全局 mock 放这里。
- **DOM 清理放在 `tests/setup.dom.ts`**：只有需要浏览器环境的测试才走这个 setup；这里负责 `cleanup()`、`confirm` 等 DOM 侧处理。
- **数据库隔离放在 `tests/setup.ts`**：只有真实使用 `@/lib/db`、`getTestDb()` 或需要内存 SQLite 的测试才走这里；不要让所有 unit 测试都背数据库初始化成本。

### 环境选择

- **Node 优先，DOM 按需**：不依赖浏览器 API 的测试默认使用 `node` 环境；只有真正需要 `render`、`screen`、`window`、`document` 的测试才使用 `happy-dom`。
- **集成测试默认走 `node`**：只有明确的 client integration 测试才放进 DOM project。
- **数据库测试使用内存 SQLite**：继续使用 `:memory:`，不引入外部数据库依赖。

### 测试数据与隔离

- **测试数据优先使用 helpers/factories**：使用 `tests/helpers/factories.ts`、`tests/helpers/schema-setup.ts`，不要在测试里随手硬编码大段数据结构。
- **不要在全新内存库上做多余初始化**：像重复 drop 全表这种工作，如果数据库本来就是每文件新建的，就不应该再额外做一次。
- **并行度按 project 控制**：不要再用一个全局 `fileParallelism: false` 粗暴串行化整个套件；需要隔离的 project 单独收紧，不需要的保持并行。

### 性能与质量约束

- **优化测试速度不能降级测试**：不能通过删除断言、跳过测试、把 integration 改成 unit mock、或降低覆盖范围来换速度。
- **改动测试结构后必须验证测试边界**：至少确认 `test:unit` 不包含 `tests/integration/**`，`test:integration` 不包含 unit 文件。
- **高成本 helper 要复用**：像 ESLint 这类初始化昂贵的对象，应在同一测试文件内复用实例，不要每个 case 重建。
- **测试期日志默认收敛**：除非正在专项排查，不要让测试默认刷大量 `console.log` / 业务日志；调试日志应显式开关控制。
- **修复 bug 先写测试复现**：先写能复现 bug 的测试，确认测试失败后再修复。

---

## 12. 禁止模式（Anti-patterns）

| 禁止 | 原因 | 替代方案 |
|---|---|---|
| Server Action 返回 `{ success, error }` | 非项目约定 | 直接 throw |
| 在 `use-cases.ts` / `queries.ts` 中定义类型或实现逻辑 | barrel 职责混乱 | 移入 `application/use-cases/` 或 `application/queries/` |
| 在 `actions.ts` 中直接实现函数体 | barrel 职责混乱 | 移入 `server-actions/` 子目录 |
| 在 `contracts.ts` 中 import/re-export `application/` 内部类型 | 跨层耦合 | 在 `contracts.ts` 本地定义，或通过 `use-cases.ts` barrel 暴露 |
| 跨模块 deep import（`@/modules/ledger/application/...`） | 破坏封装 | 通过模块公共入口 |
| 手动 `useState` 做乐观更新 | 与 factory 冲突 | `useLedgerMutation` + `onOptimisticUpdate` |
| `invalidateQueries` 放在 `onSuccess` | 出错时缓存不刷新 | 放在 `onSettled` |
| 硬编码 query key 字符串 | 无法统一 invalidation | `queryKeys` 工厂 |
| 存储日期为时间戳 | 时区问题 | `yyyy-MM-dd` 字符串 |
| 在 `src/app` 中写业务逻辑 | 违反 thin app 原则 | 移入对应模块 `application/` |
| `engine.register()` 在 task-registry 之外调用 | 注册入口分散 | 只在 `task-registry.ts` 注册 |
| 用 Spinner 表示加载 | 与 UX 规范不符 | Skeleton |
