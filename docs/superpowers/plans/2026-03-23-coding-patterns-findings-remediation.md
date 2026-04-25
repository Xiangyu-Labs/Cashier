# Coding Patterns Findings Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复本轮 deep review 已确认的 `docs/architecture/coding-patterns.md` 代码级违规点，并补齐能长期锁住这些规则的测试。

**Architecture:** 这次整改只覆盖已经确认且可直接落地的代码问题，不把需要政策判断的 `docs/` 文档治理混进来。实现顺序按风险走：先修正会影响租户隔离和软删除语义的数据访问，再收敛 ledger 边界 schema 与标准错误类型，最后把 task queue 轮询统一到共享 polling abstraction，并做一轮静态与针对性回归验证。

**Tech Stack:** Next.js App Router, Server Actions, TypeScript, Drizzle ORM, Zod, TanStack Query, Vitest

---

## Scope Note

本计划**不包含** `docs/abstraction-layer-analysis.md` / `docs/superpowers/**` 的文档治理整改。那部分需要先明确“归档工件是否允许存在”的策略，否则实现阶段会在“删文档”与“补治理例外”之间摇摆。这里先只修复已经确认的代码和测试问题。

## 变更地图

### 需要修改的代码文件
- `src/modules/ledger/application/use-cases/mutate-ledger-entries.ts`
  账本分录创建时，把 source document 的账本隔离与软删除过滤下推到 SQL。
- `src/modules/source-document/application/use-cases/delete-source-document.ts`
  单删 / 批删 source document 时，不再先取回后在内存中过滤 active rows。
- `src/modules/source-document/application/use-cases/retry-source-document.ts`
  单条 retry 时，把 active source document 过滤下推到 SQL。
- `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`
  批量 retry 时，只查询 active source documents。
- `src/modules/ledger/application/use-cases/delete-ledger.ts`
  保留幂等删除语义，但把“owned active ledger / owned deleted ledger”判断显式落成 SQL 条件，而不是一次按 id 取回后在内存里判断。
- `src/modules/ledger/contract-schemas.ts`
  收拢 ledger server-action 的输入 contract 与 parse helper；新增 service credential 相关 schema；提供统一 `ValidationError` 包装。
- `src/modules/ledger/server-actions/create.ts`
  改用 `contract-schemas.ts` 导出的 parse helper，不再直接 `.parse()`.
- `src/modules/ledger/server-actions/update.ts`
  同上。
- `src/modules/ledger/server-actions/categories.ts`
  同上。
- `src/modules/ledger/server-actions/entries.ts`
  同上。
- `src/modules/ledger/server-actions/credentials.ts`
  移除内联 schema；把 create/delete service credential 的输入都交给 `contract-schemas.ts`。
- `src/modules/task-queue/ui/useTaskQueue.ts`
  改用 `useSmartPolling`，保留现有 `3s active / 15s idle` 轮询节奏。

### 需要删除的文件
- `src/modules/ledger/server-actions/schemas.ts`
  这份文件与 `src/modules/ledger/contract-schemas.ts` 重复，删除后由后者成为唯一事实源。

### 需要修改或新增的测试文件
- `tests/integration/ledger/entry-actions.test.ts`
  新增“foreign ledger source document / deleted source document”用例，真正复现当前缺陷。
- `tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts`
  锁定单删 / 批删只对 active source documents 发起查询。
- `tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts`
  锁定单条 retry 直接使用 active-row predicate。
- `tests/unit/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts`
  锁定批量 retry 不再依赖内存过滤 active rows。
- `tests/unit/modules/ledger/application/use-cases/delete-ledger.test.ts`
  新建，锁定 `deleteLedger` 的两阶段 SQL 语义：active owned -> 删除，deleted owned -> 幂等成功，foreign -> Forbidden，missing -> NotFound。
- `tests/unit/modules/ledger/server-actions/validation.test.ts`
  新建，锁定 ledger server-actions 统一抛 `ValidationError`，并验证 service credential 输入 contract 已迁移到 `contract-schemas.ts`。
- `tests/integration/api/service-credentials.test.ts`
  增补 end-to-end 行为，验证 invalid name / invalid credential id 不再泄漏原始 `ZodError`。
- `tests/unit/modules/task-queue/ui/useTaskQueue.test.ts`
  改为锁定 `useTaskQueue` 通过 `useSmartPolling` 组装轮询，而不是只锁回调结果。

### 参考文件
- `docs/architecture/coding-patterns.md`
- `tests/unit/source-document/access.test.ts`
- `tests/integration/task-queue/task-actions-validation.test.ts`
- `tests/integration/source-document/source-document-query-actions.test.ts`

---

### Task 1: 锁定 ledger entry 对 source document 的账本隔离与软删除过滤

**Files:**
- Modify: `src/modules/ledger/application/use-cases/mutate-ledger-entries.ts`
- Test: `tests/integration/ledger/entry-actions.test.ts`

- [ ] **Step 1: 在 `tests/integration/ledger/entry-actions.test.ts` 写两个失败用例**

追加两个用例，分别锁定：

```typescript
it("rejects a source document that belongs to a different ledger", async () => {
  const db = getTestDb();
  const otherLedgerId = uuidv4();
  await db.insert(ledgers).values({
    id: otherLedgerId,
    userId: TEST_USER_ID,
    metadata: { settings: { mainCurrency: "CNY" } },
  });
  const otherDoc = await seedDoc(db, otherLedgerId);

  await expect(
    createLedgerEntryAction(ledgerId, {
      amount: 12,
      currency: "CNY",
      itemName: "Cross-ledger doc",
      sourceDocumentId: otherDoc.id,
    })
  ).rejects.toThrow("Source document");
});

it("rejects a deleted source document", async () => {
  const db = getTestDb();
  await db
    .update(sourceDocuments)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(eq(sourceDocuments.id, docId));

  await expect(
    createLedgerEntryAction(ledgerId, {
      amount: 12,
      currency: "CNY",
      itemName: "Deleted doc",
      sourceDocumentId: docId,
    })
  ).rejects.toThrow("Source document");
});
```

- [ ] **Step 2: 运行失败测试，确认当前实现确实放过了这两种非法 source document**

Run:

```bash
npm run test:integration -- tests/integration/ledger/entry-actions.test.ts
```

Expected: 新增的两个 case 失败；当前实现会按 `sourceDocumentId` 直接读取 source document 并继续创建 entry。

- [ ] **Step 3: 在 `mutate-ledger-entries.ts` 增加本地 helper，只查“当前账本的未删除 source document”**

不要从 `@/modules/source-document/*` 引 helper。`ledger` 模块被边界规则禁止依赖 `source-document` 模块公共 API，因此这里直接在本文件内声明一个局部 helper，保持边界干净：

```typescript
function whereActiveSourceDocumentForLedger(ledgerId: string, sourceDocumentId: string) {
  return and(
    eq(sourceDocuments.id, sourceDocumentId),
    eq(sourceDocuments.ledgerId, ledgerId),
    ne(sourceDocuments.status, "deleted")
  )!;
}
```

- [ ] **Step 4: 把 `createLedgerEntryWithConversion` 的 source document 查询改为使用该 helper，并在查不到时抛 `NotFoundError`**

替换当前逻辑：

```typescript
const sourceDoc = await db.query.sourceDocuments.findFirst({
  where: whereActiveSourceDocumentForLedger(input.ledgerId, input.sourceDocumentId),
  columns: { entryDate: true },
});

if (sourceDoc == null) {
  throw new NotFoundError("Source document");
}
```

实现要求：
- 仍然保留 `entryDate` 用于汇率换算；
- 不允许“查不到 source document 时继续创建 entry”；
- 需要在文件顶部补 `ne` import。

- [ ] **Step 5: 重新运行针对性测试**

Run:

```bash
npm run test:integration -- tests/integration/ledger/entry-actions.test.ts
```

Expected: PASS

- [ ] **Step 6: 运行关联回归**

Run:

```bash
npm run test:integration -- tests/integration/cascade-operations.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/integration/ledger/entry-actions.test.ts \
        src/modules/ledger/application/use-cases/mutate-ledger-entries.ts
git commit -m "fix: scope ledger entry source documents to active ledger rows"
```

---

### Task 2: 把 source-document 删除与重试路径的 active-row 过滤下推到 SQL

**Files:**
- Modify: `src/modules/source-document/application/use-cases/delete-source-document.ts`
- Modify: `src/modules/source-document/application/use-cases/retry-source-document.ts`
- Modify: `src/modules/source-document/application/use-cases/batch-retry-source-documents.ts`
- Modify: `tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts`
- Modify: `tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts`
- Modify: `tests/unit/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts`

- [ ] **Step 1: 在 `delete-source-document.test.ts` 写失败断言，锁定单删 / 批删只查询 active source documents**

先把测试文件的 import 改成同时引入：

```typescript
import {
  deleteSourceDocument,
  batchDeleteSourceDocuments,
} from "@/modules/source-document/application/use-cases/delete-source-document";
```

然后在同一个文件里新增 `describe("batchDeleteSourceDocuments", ...)`，并把现有 mock 扩成可观测 `whereSourceDocumentNotDeleted` helper 的版本，新增断言：

```typescript
expect(sourceDocumentsFindFirstMock).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { whereSourceDocumentNotDeletedId: ["ledger-1", "doc-1"] },
  })
);

expect(sourceDocumentsFindManyMock).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.objectContaining({
      and: expect.arrayContaining([
        { whereSourceDocumentNotDeleted: ["ledger-1"] },
      ]),
    }),
  })
);
```

如果当前测试文件里没有 `findMany` mock，就在 hoisted mock 区补 `sourceDocumentsFindManyMock`，并让新的 batch-delete 用例至少执行一次：

```typescript
const result = await batchDeleteSourceDocuments({
  ledgerId: "ledger-1",
  sourceDocumentIds: ["doc-1", "doc-2"],
});

expect(result.deletedCount).toBe(2);
```

- [ ] **Step 2: 在 `retry-source-document.test.ts` 与 `batch-retry-source-documents.test.ts` 写失败断言**

新增断言，锁定：
- 单条 retry 的 `findFirst` 直接用 `whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId)`；
- 批量 retry 的 `findMany` 直接用 `whereSourceDocumentNotDeleted(ledgerId)` 加 `inArray(sourceDocuments.id, sourceDocumentIds)`；
- 删除态和已软删除记录不再靠 `.filter(document => ...)` 做二次筛选。

- [ ] **Step 3: 运行失败测试**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts \
  tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts \
  tests/unit/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts
```

Expected: FAIL，当前实现的初始查询仍然是“ledgerId + id / ids”再做内存过滤。

- [ ] **Step 4: 修改 `delete-source-document.ts`**

实现要求：
- 单条 delete 初始查询改为 `whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId)`；
- 查不到时继续保持现有语义，返回 `{ sourceDocumentId, deleted: false }`；
- 批量 delete 初始查询改为：

```typescript
where: and(
  whereSourceDocumentNotDeleted(ledgerId),
  inArray(sourceDocuments.id, sourceDocumentIds)
)
```

- 删除 `.filter(document => document.status !== ... && document.deletedAt == null)` 这类内存筛选代码。

- [ ] **Step 5: 修改 `retry-source-document.ts`**

单条 retry 初始查询改为：

```typescript
const existingDocument = await db.query.sourceDocuments.findFirst({
  where: whereSourceDocumentNotDeletedId(ledgerId, sourceDocumentId),
});

if (existingDocument == null) {
  throw new NotFoundError("Source document");
}
```

删除后续对 `status === Deleted` / `deletedAt != null` 的内存判定分支。

- [ ] **Step 6: 修改 `batch-retry-source-documents.ts`**

批量 retry 初始查询改为：

```typescript
const oldDocs = await db.query.sourceDocuments.findMany({
  where: and(
    whereSourceDocumentNotDeleted(ledgerId),
    inArray(sourceDocuments.id, sourceDocumentIds)
  ),
});
```

删除 `candidateDocs.filter(...)` 分支，`oldDocs` 直接作为 active docs 使用。

- [ ] **Step 7: 重新运行 unit tests**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts \
  tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts \
  tests/unit/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts
```

Expected: PASS

- [ ] **Step 8: 运行 source-document 行为回归**

Run:

```bash
npm run test:integration -- \
  tests/integration/source-document/retry-action.test.ts \
  tests/integration/source-document/batch-retry-action.test.ts \
  tests/integration/api/source-document-delete-idempotency.test.ts \
  tests/integration/api/source-document-delete-race-condition.test.ts
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/modules/source-document/application/use-cases/delete-source-document.ts \
        src/modules/source-document/application/use-cases/retry-source-document.ts \
        src/modules/source-document/application/use-cases/batch-retry-source-documents.ts \
        tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts \
        tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts \
        tests/unit/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts
git commit -m "fix: query active source documents at the SQL boundary"
```

---

### Task 3: 让 ledger 删除路径显式使用 SQL 作用域，同时保留幂等删除语义

**Files:**
- Modify: `src/modules/ledger/application/use-cases/delete-ledger.ts`
- Create: `tests/unit/modules/ledger/application/use-cases/delete-ledger.test.ts`
- Test: `tests/integration/api/ledger-delete-idempotency.test.ts`

- [ ] **Step 1: 新建 `tests/unit/modules/ledger/application/use-cases/delete-ledger.test.ts` 并写失败测试**

使用 mock DB 的方式锁定三段式行为：

```typescript
it("deletes an active ledger found by id + userId + deletedAt is null", async () => {
  // 第一个 query 返回 active ledger，后续进入 transaction
});

it("returns silently when the owned ledger is already soft deleted", async () => {
  // 第一个 query 返回 null；第二个 owned-without-active-filter query 返回 deleted ledger；函数直接 return
});

it("throws ForbiddenError when another user's ledger exists", async () => {
  // active owned query / deleted owned query 都 miss；existence query by id 命中；抛 ForbiddenError
});

it("throws NotFoundError when no ledger exists for the id", async () => {
  // 三次 query 都 miss；抛 NotFoundError
});
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
npm run test:unit -- tests/unit/modules/ledger/application/use-cases/delete-ledger.test.ts
```

Expected: FAIL，当前实现只有一次 `where: eq(ledgers.id, ledgerId)` 查询。

- [ ] **Step 3: 修改 `delete-ledger.ts` 为显式的三段式 SQL 逻辑**

实现顺序固定如下：

```typescript
const activeOwnedLedger = await db.query.ledgers.findFirst({
  where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId), isNull(ledgers.deletedAt)),
});

if (activeOwnedLedger != null) {
  // 进入现有 transaction 删除流程
  return;
}

const deletedOwnedLedger = await db.query.ledgers.findFirst({
  where: and(eq(ledgers.id, ledgerId), eq(ledgers.userId, userId)),
  columns: { id: true, deletedAt: true },
});

if (deletedOwnedLedger != null) {
  return;
}

const foreignLedger = await db.query.ledgers.findFirst({
  where: eq(ledgers.id, ledgerId),
  columns: { id: true },
});

if (foreignLedger != null) {
  throw new ForbiddenError("Access denied to this ledger");
}

throw new NotFoundError("Ledger");
```

实现要求：
- 不改变现有 transaction 删除内容；
- 不改变现有幂等删除行为；
- 需要补 `isNull` import。

- [ ] **Step 4: 重新运行 unit test**

Run:

```bash
npm run test:unit -- tests/unit/modules/ledger/application/use-cases/delete-ledger.test.ts
```

Expected: PASS

- [ ] **Step 5: 运行现有幂等删除集成测试**

Run:

```bash
npm run test:integration -- tests/integration/api/ledger-delete-idempotency.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/ledger/application/use-cases/delete-ledger.ts \
        tests/unit/modules/ledger/application/use-cases/delete-ledger.test.ts
git commit -m "refactor: scope ledger deletion queries without breaking idempotency"
```

---

### Task 4: 收拢 ledger server-action 的输入 contract，并统一抛 `ValidationError`

**Files:**
- Modify: `src/modules/ledger/contract-schemas.ts`
- Delete: `src/modules/ledger/server-actions/schemas.ts`
- Modify: `src/modules/ledger/server-actions/create.ts`
- Modify: `src/modules/ledger/server-actions/update.ts`
- Modify: `src/modules/ledger/server-actions/categories.ts`
- Modify: `src/modules/ledger/server-actions/entries.ts`
- Modify: `src/modules/ledger/server-actions/credentials.ts`
- Create: `tests/unit/modules/ledger/server-actions/validation.test.ts`
- Modify: `tests/integration/api/service-credentials.test.ts`

- [ ] **Step 1: 新建 `tests/unit/modules/ledger/server-actions/validation.test.ts`，先写失败用例**

使用现有 `withAuth` / `withLedgerAccess` mock 风格，锁定以下行为：

```typescript
it("createLedgerAction rejects invalid payload with ValidationError", async () => {
  await expect(createLedgerAction({ aiLanguage: "x".repeat(200) } as never)).rejects.toBeInstanceOf(
    ValidationError
  );
});

it("createEntryCategoryAction rejects invalid payload with ValidationError", async () => {
  await expect(createEntryCategoryAction("ledger-1", { name: "" } as never)).rejects.toBeInstanceOf(
    ValidationError
  );
});

it("createLedgerEntryAction rejects invalid sourceDocumentId with ValidationError", async () => {
  await expect(
    createLedgerEntryAction("ledger-1", {
      amount: 1,
      itemName: "x",
      sourceDocumentId: "bad-id",
    } as never)
  ).rejects.toBeInstanceOf(ValidationError);
});

it("createServiceCredentialAction rejects blank name with ValidationError", async () => {
  await expect(createServiceCredentialAction("ledger-1", { name: "" } as never)).rejects.toBeInstanceOf(
    ValidationError
  );
});

it("deleteServiceCredentialAction rejects invalid credential id with ValidationError", async () => {
  await expect(deleteServiceCredentialAction("ledger-1", "bad-id")).rejects.toBeInstanceOf(
    ValidationError
  );
});
```

- [ ] **Step 2: 在 `tests/integration/api/service-credentials.test.ts` 补两个 end-to-end 用例**

新增：

```typescript
it("rejects blank credential name with ValidationError", async () => {
  await expect(createServiceCredentialAction(testLedgerId, { name: "" } as never)).rejects.toThrow(
    ValidationError
  );
});

it("rejects invalid credential id with ValidationError", async () => {
  await expect(deleteServiceCredentialAction(testLedgerId, "bad-id")).rejects.toThrow(
    ValidationError
  );
});
```

- [ ] **Step 3: 运行失败测试**

Run:

```bash
npm run test:unit -- tests/unit/modules/ledger/server-actions/validation.test.ts
npm run test:integration -- tests/integration/api/service-credentials.test.ts
```

Expected: FAIL；当前 ledger server-actions 仍有 `.parse()` 直接抛原始 `ZodError`，且 service credential schema 仍留在 `credentials.ts` 内。

- [ ] **Step 4: 在 `contract-schemas.ts` 增加统一 parse helper 与 service credential contract**

在该文件中新增：

```typescript
function parseLedgerContract<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", { issues: result.error.issues });
  }
  return result.data;
}

export const createServiceCredentialInputSchema = strictObjectSchema({
  name: z.string().trim().min(1).max(100),
});

export const serviceCredentialIdSchema = uuidSchema;

export const parseCreateLedgerInput = (input: unknown) =>
  parseLedgerContract(createLedgerInputSchema, input);
// 继续为 updateLedger / createEntryCategory / updateEntryCategory /
// createLedgerEntry / updateLedgerEntry / batchUpdateLedgerEntries /
// createServiceCredential / serviceCredentialId 导出 parse helper
```

- [ ] **Step 5: 删除 `server-actions/schemas.ts`，并把所有 ledger server-actions 改用 parse helper**

替换模式统一为：

```typescript
const validated = parseCreateLedgerEntryInput(data);
const validatedLedgerEntryId = parseLedgerEntryId(ledgerEntryId);
const validatedCredentialId = parseServiceCredentialId(credentialId);
```

实现要求：
- `credentials.ts` 不再本地声明 `z.object({ name: ... })`；
- `deleteServiceCredentialAction` 必须在 server-action 边界 parse `credentialId`；
- 删除 `src/modules/ledger/server-actions/schemas.ts` 后，仓库里不再引用它。

- [ ] **Step 6: 重新运行 unit / integration tests**

Run:

```bash
npm run test:unit -- tests/unit/modules/ledger/server-actions/validation.test.ts
npm run test:integration -- tests/integration/api/service-credentials.test.ts
```

Expected: PASS

- [ ] **Step 7: 跑 ledger 相关回归**

Run:

```bash
npm run test:unit -- tests/unit/ledger/server-actions-omission.test.ts
npm run test:integration -- tests/integration/ledger/entry-actions.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/ledger/contract-schemas.ts \
        src/modules/ledger/server-actions/create.ts \
        src/modules/ledger/server-actions/update.ts \
        src/modules/ledger/server-actions/categories.ts \
        src/modules/ledger/server-actions/entries.ts \
        src/modules/ledger/server-actions/credentials.ts \
        tests/unit/modules/ledger/server-actions/validation.test.ts \
        tests/integration/api/service-credentials.test.ts
git rm src/modules/ledger/server-actions/schemas.ts
git commit -m "refactor: centralize ledger server action contracts"
```

---

### Task 5: 把 task queue 轮询统一到 `useSmartPolling`

**Files:**
- Modify: `src/modules/task-queue/ui/useTaskQueue.ts`
- Modify: `tests/unit/modules/task-queue/ui/useTaskQueue.test.ts`

- [ ] **Step 1: 改写 `useTaskQueue.test.ts`，先写失败测试，锁定 `useSmartPolling` 被调用**

把测试改成显式 mock `@/hooks/use-smart-polling`：

```typescript
const useSmartPollingMock = vi.fn(() => "polling-fn");

vi.mock("@/hooks/use-smart-polling", () => ({
  useSmartPolling: useSmartPollingMock,
}));

it("builds task queue polling with useSmartPolling", () => {
  useQueryMock.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });

  useTaskQueue("ledger-1");

  expect(useSmartPollingMock).toHaveBeenCalledWith({
    isPollingActive: expect.any(Function),
    activeIntervalMs: 3000,
    idleIntervalMs: 15000,
  });

  const options = useQueryMock.mock.calls[0]?.[0];
  expect(options?.refetchInterval).toBe("polling-fn");
});
```

保留一个行为测试，继续锁定 `pending/running -> 3000`、`idle -> 15000`。

- [ ] **Step 2: 运行失败测试**

Run:

```bash
npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueue.test.ts
```

Expected: FAIL；当前实现没有 import `useSmartPolling`。

- [ ] **Step 3: 修改 `useTaskQueue.ts`**

改成：

```typescript
const taskQueuePolling = useSmartPolling<TaskQueueResult>({
  isPollingActive: (data) =>
    (data?.stats?.pendingCount ?? 0) > 0 || (data?.stats?.runningCount ?? 0) > 0,
  activeIntervalMs: 3000,
  idleIntervalMs: 15000,
});

const { data, isLoading, refetch } = useQuery<TaskQueueResult>({
  queryKey: queryKeys.taskQueue(ledgerId),
  queryFn: () => getTaskQueueAction(ledgerId),
  refetchInterval: taskQueuePolling,
  enabled: ledgerId.length > 0,
});
```

实现要求：
- 不改变默认轮询节奏；
- 仅替换实现方式；
- 顺手把 `enabled` 写成布尔表达式 `ledgerId.length > 0`。

- [ ] **Step 4: 重新运行 hook 测试**

Run:

```bash
npm run test:unit -- tests/unit/modules/task-queue/ui/useTaskQueue.test.ts
```

Expected: PASS

- [ ] **Step 5: 运行 task queue 相关回归**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/task-queue/ui/useTaskQueueModal.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueMutations.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueueModalActions.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/task-queue/ui/useTaskQueue.ts \
        tests/unit/modules/task-queue/ui/useTaskQueue.test.ts
git commit -m "refactor: reuse smart polling in task queue hook"
```

---

### Task 6: 最终验证

**Files:**
- Modify: none unless verification暴露真实问题

- [ ] **Step 1: 运行本次整改涉及的 unit tests**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/source-document/application/use-cases/delete-source-document.test.ts \
  tests/unit/modules/source-document/application/use-cases/retry-source-document.test.ts \
  tests/unit/modules/source-document/application/use-cases/batch-retry-source-documents.test.ts \
  tests/unit/modules/ledger/application/use-cases/delete-ledger.test.ts \
  tests/unit/modules/ledger/server-actions/validation.test.ts \
  tests/unit/modules/task-queue/ui/useTaskQueue.test.ts \
  tests/unit/ledger/server-actions-omission.test.ts
```

Expected: PASS

- [ ] **Step 2: 运行本次整改涉及的 integration tests**

Run:

```bash
npm run test:integration -- \
  tests/integration/ledger/entry-actions.test.ts \
  tests/integration/cascade-operations.test.ts \
  tests/integration/source-document/retry-action.test.ts \
  tests/integration/source-document/batch-retry-action.test.ts \
  tests/integration/api/source-document-delete-idempotency.test.ts \
  tests/integration/api/source-document-delete-race-condition.test.ts \
  tests/integration/api/ledger-delete-idempotency.test.ts \
  tests/integration/api/service-credentials.test.ts
```

Expected: PASS

- [ ] **Step 3: 运行静态检查**

Run:

```bash
npm run lint
npm run tsc
```

Expected: PASS

- [ ] **Step 4: 若验证全部通过，创建收尾 commit**

```bash
git status --short
git add -A
git commit -m "fix: close remaining coding patterns findings"
```

如果前面每个 task 都已单独 commit，则这一步跳过，不再制造空 commit。

---

## 实施注意事项

- `ledger` 模块禁止依赖 `@/modules/source-document/*` 公共 API。修复 `mutate-ledger-entries.ts` 时必须在本文件内定义局部 SQL helper，不能为了复用去 import `whereSourceDocumentNotDeletedId`。
- `deleteLedger` 必须同时保留三种现有语义：真正不存在 -> `NotFoundError`，他人账本 -> `ForbiddenError`，已软删除且属于当前用户 -> 幂等成功。
- 本计划不要求新增全局 governance lint rule；`useTaskQueue` 这次只需要被测试显式锁定对 `useSmartPolling` 的复用。
- `ValidationError` 的统一入口放在 `src/modules/ledger/contract-schemas.ts`，不要再引入新的 `server-actions/*schemas.ts` 文件。
