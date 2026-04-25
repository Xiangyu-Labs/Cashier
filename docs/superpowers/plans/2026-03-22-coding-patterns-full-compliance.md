# Coding Patterns Full Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复整仓所有已确认的 `docs/architecture/coding-patterns.md` 违规点，并补齐测试与验证，使项目达到严格一致的 coding patterns 合规状态。

**Architecture:** 这次整改拆成 8 个可独立交付的子任务：先修复 server-actions 边界、app 层边界、错误类与数据访问，再收敛 query key / polling / 客户端过滤，最后迁移 `src/` 下测试并拆分超长组件与 hook。每个子任务都遵循 TDD：先补能锁定问题的测试，再做最小实现，最后跑针对性测试和一轮回归。

**Tech Stack:** Next.js App Router, TypeScript, Server Actions, Zod, TanStack Query, Vitest, Drizzle ORM, next-intl

---

## 变更地图

### 已确认需要修改的代码文件
- `src/modules/source-document/server-actions/queries.ts` — 将复杂查询 action 拆成薄边界；补齐 Zod parse；下沉实现到 `application/queries/`
- `src/modules/source-document/actions.ts` — 保持纯 re-export，仅暴露 server-actions
- `src/modules/source-document/application/queries/source-document-queries.ts` — 吸收从 server-actions 下沉的查询参数整理/错误语义
- `src/modules/source-document/hooks/useSourceDocuments.ts` — 去掉客户端金额过滤，改为服务端过滤；统一 polling 语义
- `src/modules/source-document/contract-schemas.ts` — 为新的 source-document 查询过滤参数补 schema
- `src/modules/source-document/contracts.ts` — 如需暴露新的查询 DTO，在此本地定义
- `src/modules/task-queue/server-actions/task-actions.ts` — 为 taskId / taskIds 补 schema.parse；确保 action 边界一致
- `src/modules/auth/server-actions/send-otp.ts` — 补边界层 schema.parse（若当前已是 server-action 文件则只补校验）
- `src/modules/stats/server-actions/get-enhanced-stats.ts` 或当前 stats action 文件 — 补 schema.parse 并收敛边界
- `src/app/api/v1/source-documents/route.ts` — 消除 app 层直接 use-case 依赖，统一走模块公共 action/query 边界
- `src/modules/source-document/server-actions/create-from-credential.ts`（如不存在则新建）— 承载 API v1 source-documents POST 对应的 server-action 边界
- `src/modules/source-document/application/use-cases/create-from-credential.ts`（若已有则复用）— 保持业务逻辑在 application
- `src/modules/source-document/server-actions/access.ts` — 修复把所有 AppError 折叠成 UnauthorizedError 的错误语义问题
- `src/modules/source-document/application/tasks/parse-source-document.ts` — 原生 Error 改为标准错误类
- `src/modules/ledger/application/use-cases/export-ledger-entries.ts` — 原生 Error 改为标准错误类，并视情况收敛数据访问模式
- `src/modules/task-queue/application/use-cases/dismiss-task.ts` — 收敛内存过滤 / 软删除 where 条件
- `src/modules/task-queue/application/use-cases/cancel-task.ts` — 收敛内存过滤 / ledger 过滤下推 SQL
- `src/modules/task-queue/application/queries/get-task-queue.ts` — 减少先查再内存过滤，统一软删除 / ledger 过滤
- `src/modules/stats/application/queries/get-enhanced-stats.ts` — 视情况改为 `forLedger(ledgerId)` 作用域
- `src/modules/ledger/application/use-cases/export-ledger-entries.ts` — 视情况改为 `forLedger(ledgerId)` 或统一查询作用域
- `src/modules/workspace/ui/StatsTab.tsx` — 把手工拼接 query key 收敛进 `queryKeys` 工厂
- `src/lib/query-keys.ts` — 新增 enhanced stats 完整 key 工厂 / source-document 金额过滤 key 工厂
- `src/modules/ledger/hooks/useLedgerSettings.ts` — 评估并统一异步任务刷新策略；必要时引入 `useSmartPolling`
- `src/modules/source-document/hooks/useSourceDocuments.ts` — 用 `useSmartPolling` 替换针对异步任务监控的 `refetchInterval`（如语义适合）
- `src/modules/workspace/ui/LedgerEntriesTab.tsx` — 拆分超长组件
- `src/modules/source-document/ui/QuickEntryForm.tsx` — 拆分超长组件
- `src/modules/ledger/ui/CategorySection.tsx` — 拆分超长组件并修正事件驱动模式
- `src/modules/ledger/hooks/useLedgerSettings.ts` — 拆分超长 hook
- `src/modules/task-queue/ui/useTaskQueueMutations.ts` — 拆分超长 hook

### 已确认需要迁移的测试文件
- 所有位于 `src/modules/**`、`src/hooks/**`、`src/app/**` 的 `*.test.ts` / `*.test.tsx`
- 目标目录统一迁移到 `tests/unit/` 或 `tests/integration/`，并修复 import 路径为 `@/` 别名

### 需要新增的测试文件（至少）
- `tests/integration/source-document/source-document-query-actions.test.ts` — 锁定 source-document query server-actions 边界与过滤行为
- `tests/integration/task-queue/task-actions-validation.test.ts` — 锁定 task-queue server-actions 的 schema.parse 行为
- `tests/unit/source-document/access.test.ts` — 锁定 source-document access wrapper 的错误语义
- `tests/integration/source-document/use-source-documents-filters.test.ts` 或等价 query/use-case 测试 — 锁定金额过滤下推服务端
- `tests/unit/lib/query-keys-enhanced-stats.test.ts` — 锁定新的 queryKeys 工厂
- 对于每一处原生 Error 替换，优先在对应现有测试文件中补 case，而不是无谓创建新文件

### 参考文档
- `docs/architecture/coding-patterns.md`
- `docs/superpowers/plans/2026-03-21-coding-patterns-compliance.md`
- `docs/superpowers/plans/2026-03-21-module-structure-compliance.md`
- `docs/superpowers/plans/2026-03-21-test-files-migration.md`

---

## Task 1: 收敛 source-document 的 server-actions 边界

**Files:**
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/modules/source-document/actions.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `src/modules/source-document/contract-schemas.ts`
- Test: `tests/integration/source-document/source-document-query-actions.test.ts`

- [ ] **Step 1: 读取并列出 `queries.ts` 中每个 action 的职责边界**

Run: `grep -n "export .*SourceDocuments\|export .*SourceDocument" src/modules/source-document/server-actions/queries.ts`
Expected: 列出 `listSourceDocuments`、`getAllSourceDocumentsAction`、`getPendingSourceDocumentsAction`、`getSourceDocumentFullAction` 等入口。

- [ ] **Step 2: 写失败测试，锁定 query action 只做边界而不吞掉业务错误**

在 `tests/integration/source-document/source-document-query-actions.test.ts` 添加用例，至少覆盖：

```typescript
it("throws validation error when list params are invalid", async () => {
  await expect(
    listSourceDocuments("ledger-1", { limit: "bad" } as never)
  ).rejects.toBeInstanceOf(ValidationError);
});

it("preserves not found semantics from application query", async () => {
  vi.mocked(getSourceDocumentFullQuery).mockRejectedValueOnce(new NotFoundError("Source document"));
  await expect(getSourceDocumentFullAction("ledger-1", "missing-doc")).rejects.toBeInstanceOf(
    NotFoundError
  );
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npx vitest run tests/integration/source-document/source-document-query-actions.test.ts`
Expected: FAIL，现状会因为 wrapper/通用 AppError 包装导致语义不符，或测试还未接入新边界。

- [ ] **Step 4: 将参数整理、分页默认值、错误包装从 `server-actions/queries.ts` 下沉到 `application/queries/source-document-queries.ts`**

要求：
- `server-actions/queries.ts` 中每个导出函数只保留：access wrapper + `schema.parse()` + 调用 application query；
- 不在 server-actions 中写 `try/catch` 把所有错误包成 `AppError("QUERY_ERROR")`；
- 保留真正必要的日志，但不要改变错误类型；
- 若 `getAllSourceDocumentsAction` 需要默认分页限制，放进 application query 辅助函数，而不是 server-action。

- [ ] **Step 5: 在 `contract-schemas.ts` 中补齐 source-document 查询过滤 schema**

如果金额过滤将下推服务端，则新增类似：

```typescript
export const listAllSourceDocumentsInputSchema = z.object({
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(1000).optional(),
});
```

按现有 schema 风格命名，不要机械照抄上例。

- [ ] **Step 6: 再次运行测试，确认通过**

Run: `npx vitest run tests/integration/source-document/source-document-query-actions.test.ts`
Expected: PASS

- [ ] **Step 7: 做一轮 source-document 相关回归测试**

Run: `npx vitest run tests/integration/source-document/ tests/integration/api/source-document-delete-race-condition.test.ts tests/integration/api/retry-source-document.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/source-document/server-actions/queries.ts \
        src/modules/source-document/application/queries/source-document-queries.ts \
        src/modules/source-document/contract-schemas.ts \
        tests/integration/source-document/source-document-query-actions.test.ts
git commit -m "refactor(source-document): thin query server actions and preserve error semantics"
```

---

## Task 2: 补齐遗漏的 server-action 边界校验

**Files:**
- Modify: `src/modules/task-queue/server-actions/task-actions.ts`
- Modify: `src/modules/auth/server-actions/send-otp.ts`
- Modify: `src/modules/stats/server-actions/get-enhanced-stats.ts`
- Modify: `src/modules/stats/contracts.ts`（如需导出输入 DTO）
- Modify: `src/modules/task-queue/contracts.ts`（如需导出输入 DTO）
- Test: `tests/integration/task-queue/task-actions-validation.test.ts`
- Test: `tests/integration/auth/auth-actions.test.ts`
- Test: `tests/integration/stats/enhanced-stats.test.ts`

- [ ] **Step 1: 为 task-queue action 输入写失败测试**

在 `tests/integration/task-queue/task-actions-validation.test.ts` 添加用例：

```typescript
it("rejects invalid task id in cancelTaskAction", async () => {
  await expect(cancelTaskAction(ledgerId, "")).rejects.toBeInstanceOf(ValidationError);
});

it("rejects empty ids in batchDismissTasksAction", async () => {
  await expect(batchDismissTasksAction(ledgerId, [""])).rejects.toBeInstanceOf(ValidationError);
});
```

- [ ] **Step 2: 为 auth / stats 输入校验写失败测试**

在现有测试文件中补 case，至少覆盖：

```typescript
await expect(sendOTPAction("not-an-email")).rejects.toBeInstanceOf(ValidationError);
await expect(getEnhancedStats({ ledgerId, queryRange: { from: "bad", to: "bad" }, compareRange: { from: "bad", to: "bad" } })).rejects.toBeInstanceOf(ValidationError);
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npx vitest run tests/integration/task-queue/task-actions-validation.test.ts tests/integration/auth/auth-actions.test.ts tests/integration/stats/enhanced-stats.test.ts`
Expected: FAIL，当前 server-actions 未统一做 parse。

- [ ] **Step 4: 为 task-queue/auth/stats server-actions 补 `schema.parse()`**

要求：
- 不把校验下沉到 application；
- 新 schema 放在模块 `contract-schemas.ts` 或现有 schema 文件；
- task-queue 的 `taskId` / `taskIds` 用明确 schema，不在 action 内手写 if 判断；
- stats 的 range 入参使用 object schema 一次性 parse。

- [ ] **Step 5: 运行针对性测试确认通过**

Run: `npx vitest run tests/integration/task-queue/task-actions-validation.test.ts tests/integration/auth/auth-actions.test.ts tests/integration/stats/enhanced-stats.test.ts`
Expected: PASS

- [ ] **Step 6: 跑 task-queue / auth / stats 回归**

Run: `npx vitest run tests/integration/task-queue/ tests/integration/auth/ tests/integration/stats/`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/task-queue/server-actions/task-actions.ts \
        src/modules/auth/server-actions/send-otp.ts \
        src/modules/stats/server-actions/get-enhanced-stats.ts \
        tests/integration/task-queue/task-actions-validation.test.ts
git commit -m "fix: validate server action inputs at module boundaries"
```

---

## Task 3: 修复 app 层直接 use-case 依赖，统一公共边界

**Files:**
- Modify: `src/app/api/v1/source-documents/route.ts`
- Create: `src/modules/source-document/server-actions/create-from-credential.ts`（若不存在）
- Modify: `src/modules/source-document/actions.ts`
- Modify: `src/modules/source-document/use-cases.ts`（仅在需要纯 barrel 补导出时）
- Test: `tests/integration/api/source-documents-route.test.ts`

- [ ] **Step 1: 写失败测试，锁定 POST/GET 路由行为不变**

在 `tests/integration/api/source-documents-route.test.ts` 增补或新建：

```typescript
it("creates source document through api v1 route", async () => {
  const response = await POST(mockRequestWithValidCredential(payload));
  expect(response.status).toBe(201);
});

it("lists source documents through api v1 route", async () => {
  const response = await GET(mockRequestWithValidCredentialQuery());
  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: 运行测试，确认现有行为被锁定**

Run: `npx vitest run tests/integration/api/source-documents-route.test.ts`
Expected: PASS（这是保护性基线测试，不要求先失败）

- [ ] **Step 3: 新增/调整 source-document 公共 action，使 `route.ts` 不再 import `use-cases`**

目标边界：
- `route.ts` 只 import `@/modules/source-document/actions` 与 schema；
- 真正业务逻辑仍在 application/use-case；
- 如果是 API v1 credential 专用场景，可以在 `server-actions/` 中建立一个薄边界函数，名称要准确表达 credential 场景。

- [ ] **Step 4: 更新 `src/app/api/v1/source-documents/route.ts`**

改为只通过模块公共入口调用，不直接引用 `@/modules/source-document/use-cases`。

- [ ] **Step 5: 运行 API 测试确认通过**

Run: `npx vitest run tests/integration/api/source-documents-route.test.ts tests/integration/api/ledger-entries.test.ts tests/integration/api/source-document-delete-idempotency.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/source-documents/route.ts \
        src/modules/source-document/actions.ts \
        src/modules/source-document/server-actions/create-from-credential.ts \
        tests/integration/api/source-documents-route.test.ts
git commit -m "refactor(api): route source document api through module action boundary"
```

---

## Task 4: 统一标准错误类与错误语义

**Files:**
- Modify: `src/modules/source-document/application/tasks/parse-source-document.ts`
- Modify: `src/modules/ledger/application/use-cases/export-ledger-entries.ts`
- Modify: `src/modules/source-document/server-actions/access.ts`
- Test: 复用 `tests/integration/ledger-export.test.ts`
- Test: 复用 `tests/integration/processing-tasks.test.ts`
- Test: 新增 `tests/unit/source-document/access.test.ts`

- [ ] **Step 1: 为错误语义写失败测试**

新增/补充测试，至少覆盖：

```typescript
it("throws NotFoundError when source document is missing", async () => {
  await expect(parseSourceDocumentHandler.execute({ ...input, sourceDocumentId: "missing" }, context)).rejects.toBeInstanceOf(NotFoundError);
});

it("preserves ledger not found semantics in source document access wrapper", async () => {
  await expect(action("missing-ledger", "doc-1")).rejects.toBeInstanceOf(NotFoundError);
});
```

以及在 ledger export 测试中覆盖 header 缺失 fallback/错误分支。

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run tests/unit/source-document/access.test.ts tests/integration/ledger-export.test.ts tests/integration/processing-tasks.test.ts`
Expected: FAIL，当前存在原生 Error 和错误语义折叠。

- [ ] **Step 3: 将原生 `Error` 替换为标准错误类**

要求：
- `Missing ledgerId in task input` → `ValidationError`
- `Source document not found` → `NotFoundError`
- `Missing CSV headers` 若理论上不应发生，优先改成 `AppError` 或直接移除不可能分支；不要保留裸 `Error`
- `source-document/server-actions/access.ts` 不再把所有 `AppError` 都转换成 `UnauthorizedError`，至少保留 `NotFoundError` / `ForbiddenError` / `ValidationError` 原语义

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/source-document/access.test.ts tests/integration/ledger-export.test.ts tests/integration/processing-tasks.test.ts`
Expected: PASS

- [ ] **Step 5: 额外跑 source-document + ledger 回归**

Run: `npx vitest run tests/integration/source-document/ tests/integration/ledger/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/application/tasks/parse-source-document.ts \
        src/modules/ledger/application/use-cases/export-ledger-entries.ts \
        src/modules/source-document/server-actions/access.ts \
        tests/unit/source-document/access.test.ts
git commit -m "fix: standardize error classes and preserve access error semantics"
```

---

## Task 5: 收敛数据访问与过滤下推到 SQL / ledger scope

**Files:**
- Modify: `src/modules/task-queue/application/use-cases/dismiss-task.ts`
- Modify: `src/modules/task-queue/application/use-cases/cancel-task.ts`
- Modify: `src/modules/task-queue/application/queries/get-task-queue.ts`
- Modify: `src/modules/stats/application/queries/get-enhanced-stats.ts`
- Modify: `src/modules/ledger/application/use-cases/export-ledger-entries.ts`
- Test: `tests/integration/task-queue/cancel-task-actions.test.ts`
- Test: `tests/integration/tasks/dismiss-task-actions.test.ts`
- Test: `tests/integration/stats/enhanced-stats.test.ts`

- [ ] **Step 1: 为 task-queue 内存过滤问题补失败测试**

在现有 task-queue integration 测试中加入跨 ledger 数据样本，锁定：
- cancel / dismiss 只能影响当前 ledger 的 task
- 已软删除记录不会被再次更新
- completed / pending 查询在 SQL 层已限制范围，而不是靠内存再过滤修正

示例：

```typescript
it("does not dismiss tasks from another ledger", async () => {
  await dismissTaskAction(ledgerA, taskFromLedgerB.id);
  const fresh = await loadTask(taskFromLedgerB.id);
  expect(fresh.dismissedAt).toBeNull();
});
```

- [ ] **Step 2: 运行测试，确认至少一个用例失败或当前无法严格表达约束**

Run: `npx vitest run tests/integration/task-queue/cancel-task-actions.test.ts tests/integration/tasks/dismiss-task-actions.test.ts`
Expected: FAIL，或需要补出能暴露 where 条件不足的新 case。

- [ ] **Step 3: 重写 task-queue 查询/更新条件**

要求：
- 尽量把 `ledgerId`、`deletedAt is null`、状态约束写进 SQL where；
- 避免先用 id 集合查全量，再在 JS 里 `filter(scopeId === ledgerId)`；
- 对 update 语句也附加 `deletedAt is null`；
- 若可行，统一引入 `forLedger(ledgerId)`；若当前 task-run 结构不适合，至少在 SQL 层完整表达 ledger 约束。

- [ ] **Step 4: 检查 stats/export 的 ledger scope 是否可收敛**

对 `get-enhanced-stats.ts` 与 `export-ledger-entries.ts`：
- 能直接使用 `forLedger(ledgerId)` 就改；
- 如果因为 join/聚合限制暂时不能直接改，也必须把 ledger / deletedAt / date 过滤完整下推到 SQL，不留内存过滤；
- 不为“统一而统一”引入过度抽象。

- [ ] **Step 5: 运行针对性测试确认通过**

Run: `npx vitest run tests/integration/task-queue/cancel-task-actions.test.ts tests/integration/tasks/dismiss-task-actions.test.ts tests/integration/stats/enhanced-stats.test.ts tests/integration/ledger-export.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/task-queue/application/use-cases/dismiss-task.ts \
        src/modules/task-queue/application/use-cases/cancel-task.ts \
        src/modules/task-queue/application/queries/get-task-queue.ts \
        src/modules/stats/application/queries/get-enhanced-stats.ts \
        src/modules/ledger/application/use-cases/export-ledger-entries.ts
git commit -m "refactor: push ledger and soft-delete filtering down to sql"
```

---

## Task 6: 收敛 query keys、客户端过滤与 polling 模式

**Files:**
- Modify: `src/lib/query-keys.ts`
- Modify: `src/modules/workspace/ui/StatsTab.tsx`
- Modify: `src/modules/source-document/hooks/useSourceDocuments.ts`
- Modify: `src/modules/ledger/hooks/useLedgerSettings.ts`
- Modify: `src/hooks/use-smart-polling.ts`（仅当需要小幅扩展能力时）
- Test: `tests/unit/lib/query-keys-enhanced-stats.test.ts`
- Test: `tests/unit/hooks/useSourceDocuments.test.ts` 或迁移后对应测试文件

- [ ] **Step 1: 为 enhanced stats query key 写失败测试**

新建 `tests/unit/lib/query-keys-enhanced-stats.test.ts`：

```typescript
it("builds enhanced stats key with date range and currency dimensions", () => {
  expect(queryKeys.enhancedStats("ledger-1", {
    startDate: "2026-03-01",
    rangeType: "month",
    mainCurrency: "USD",
  })).toEqual(["enhancedStats", "ledger-1", "2026-03-01", "month", "USD"]);
});
```

- [ ] **Step 2: 为 source-document 金额过滤下推写失败测试**

在 hook 或 query 层测试中锁定：
- `minAmount/maxAmount` 进入 query key；
- action/query 调用参数包含金额过滤；
- 不再在 hook 中 `docs.filter(...)` 做金额过滤。

- [ ] **Step 3: 运行测试，确认失败**

Run: `npx vitest run tests/unit/lib/query-keys-enhanced-stats.test.ts tests/unit/hooks/useSourceDocuments.test.ts`
Expected: FAIL

- [ ] **Step 4: 扩展 `queryKeys` 工厂并更新调用方**

要求：
- `StatsTab.tsx` 不再手工 `[...]` 拼 key；
- 所有 query 维度都体现在 `src/lib/query-keys.ts`；
- `useSourceDocuments` 的金额过滤参数进入 key 和服务端查询参数。

- [ ] **Step 5: 统一 polling 语义**

要求：
- 如果 `useSourceDocuments` / `useLedgerSettings` 的刷新本质是在监控异步任务完成，则优先改用 `useSmartPolling`；
- 如果只是单纯的数据 refresh，不强行改造成 hook 套 hook 的复杂结构；
- 最终要做到模式一致、职责清晰，避免同类场景一处 `refetchInterval` 一处手搓逻辑。

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run tests/unit/lib/query-keys-enhanced-stats.test.ts tests/unit/hooks/useSourceDocuments.test.ts tests/unit/hooks/use-task-queue-mutations.test.ts`
Expected: PASS

- [ ] **Step 7: 跑 workspace/source-document/ledger 相关回归**

Run: `npx vitest run tests/unit/hooks/ tests/integration/client/category-mutations-optimistic.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/query-keys.ts \
        src/modules/workspace/ui/StatsTab.tsx \
        src/modules/source-document/hooks/useSourceDocuments.ts \
        src/modules/ledger/hooks/useLedgerSettings.ts \
        tests/unit/lib/query-keys-enhanced-stats.test.ts
git commit -m "refactor: unify query keys and move source document filtering server-side"
```

---

## Task 7: 迁移 `src/` 下所有测试到 `tests/`

**Files:**
- Modify/Create/Delete: 所有 `src/**/*.test.ts` / `src/**/*.test.tsx`
- Modify: 相关测试 import 路径
- Test: 迁移后的目标测试文件

- [ ] **Step 1: 列出所有残留在 `src/` 下的测试文件**

Run: `find src -name '*.test.ts' -o -name '*.test.tsx'`
Expected: 输出完整列表，作为迁移清单。

- [ ] **Step 2: 按模块建立目标目录**

Run: `mkdir -p tests/unit/auth tests/unit/stats tests/unit/task-queue tests/unit/workspace tests/unit/source-document tests/unit/ledger tests/unit/currency tests/unit/app tests/unit/hooks`
Expected: 目标目录创建完成。

- [ ] **Step 3: 按模块逐批迁移测试文件并修复 import**

原则：
- UI/hook/pure util 测试迁到 `tests/unit/`；
- 真正跨 DB / action / route 的测试迁到 `tests/integration/`；
- 不把所有文件一次性乱搬，按模块提交；
- 相对路径一律改为 `@/`。

- [ ] **Step 4: 每迁完一个模块就运行该模块测试**

示例命令：
- `npx vitest run tests/unit/task-queue/`
- `npx vitest run tests/unit/workspace/`
- `npx vitest run tests/unit/source-document/`

Expected: 当前批次 PASS。

- [ ] **Step 5: 全局确认 `src/` 内已无测试残留**

Run: `find src -name '*.test.ts' -o -name '*.test.tsx'`
Expected: 无输出。

- [ ] **Step 6: 跑完整测试套件**

Run: `npm run test:run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests src
git commit -m "refactor: migrate remaining src tests into tests directory"
```

---

## Task 8: 拆分超长组件与 hooks，完成结构收尾

**Files:**
- Modify: `src/modules/workspace/ui/LedgerEntriesTab.tsx`
- Modify/Create: `src/modules/workspace/hooks/*`
- Modify: `src/modules/source-document/ui/QuickEntryForm.tsx`
- Modify/Create: `src/modules/source-document/hooks/*`
- Modify: `src/modules/ledger/ui/CategorySection.tsx`
- Modify/Create: `src/modules/ledger/hooks/*`
- Modify: `src/modules/ledger/hooks/useLedgerSettings.ts`
- Modify: `src/modules/task-queue/ui/useTaskQueueMutations.ts`
- Test: 对应现有 unit/integration 测试文件

- [ ] **Step 1: 统计每个目标文件当前行数并记录职责**

Run: `wc -l src/modules/workspace/ui/LedgerEntriesTab.tsx src/modules/source-document/ui/QuickEntryForm.tsx src/modules/ledger/ui/CategorySection.tsx src/modules/ledger/hooks/useLedgerSettings.ts src/modules/task-queue/ui/useTaskQueueMutations.ts`
Expected: 得到当前体积，作为拆分验收基线。

- [ ] **Step 2: 先给 `CategorySection` 写保护性测试**

补测试锁定“创建分类成功后输入清空”的现有行为，避免拆分时回归。

```typescript
it("clears new category input after successful create", async () => {
  // render -> type -> submit -> expect input cleared
});
```

- [ ] **Step 3: 拆分最明显的职责边界**

建议顺序：
1. `CategorySection.tsx`：提取创建/编辑/排序相关 hook；
2. `QuickEntryForm.tsx`：提取 mutation/controller hook；
3. `LedgerEntriesTab.tsx`：提取筛选、批量操作、selection 协调 hook；
4. `useLedgerSettings.ts`：拆 query + mutation + polling 协调；
5. `useTaskQueueMutations.ts`：按 cancel/dismiss/retry 等职责拆分。

要求：
- 不做无关重构；
- 新 hook 放到各自模块 `hooks/`；
- 新文件职责单一；
- 保持对外行为不变。

- [ ] **Step 4: 每拆完一块就跑对应测试**

示例：
- `npx vitest run tests/unit/components/EntryFilterPanel.test.tsx`
- `npx vitest run tests/unit/hooks/use-ledger-entries-mutations.test.ts`
- `npx vitest run tests/unit/hooks/use-task-queue-mutations.test.ts`
- `npx vitest run tests/integration/client/category-mutations-optimistic.test.tsx`

Expected: PASS

- [ ] **Step 5: 最终检查文件体积是否回到规范范围内或明显下降**

Run: `wc -l ...`（同 Step 1）
Expected: 关键文件显著缩短；若个别仍超限，需在提交说明中解释剩余原因。

- [ ] **Step 6: 跑完整测试**

Run: `npm run test:run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/workspace src/modules/source-document src/modules/ledger src/modules/task-queue tests
git commit -m "refactor: split oversized components and hooks for pattern compliance"
```

---

## 最终验收

- [ ] **Step 1: 跑类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: 跑 lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: 跑完整测试**

Run: `npm run test:run`
Expected: PASS

- [ ] **Step 4: 重新执行一次 coding-patterns 合规巡检命令**

Run:

```bash
find src -name '*.test.ts' -o -name '*.test.tsx'
grep -R "throw new Error" src/modules src/lib --include='*.ts' --include='*.tsx'
grep -R "from \"@/modules/.*/application/" src/app --include='*.ts' --include='*.tsx'
grep -R "queryKey: \[" src --include='*.ts' --include='*.tsx'
```

Expected:
- `src/` 下无测试文件
- 不再出现本次已知违规的裸 `Error`
- `src/app` 不再直接 deep/use-case 越层（对本次整改目标文件）
- 不再出现新增硬编码数组 query key

- [ ] **Step 5: 生成整改摘要并 Commit**

```bash
git status
git log --oneline -5
```

确认工作树干净、提交链条清晰。
