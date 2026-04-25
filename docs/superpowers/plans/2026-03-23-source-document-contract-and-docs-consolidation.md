# Source-Document Contract And Docs Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ambiguous source-document list semantics and shrink living reference docs down to one PRD, `UI.md`, and `coding-patterns.md` without adding new abstraction layers.

**Architecture:** Keep cursor pagination as the only generic source-document list contract. Replace the current `getAllSourceDocuments*` path with an explicitly named bounded collection path for the workspace stream only, reject legacy 2-segment cursors at the validation boundary, and keep the implementation local to the existing module/workspace call sites. For docs, keep one concise `PRD.md`, keep `UI.md`, fold only durable normative rules into `coding-patterns.md`, and delete stale descriptive mirrors instead of maintaining parallel Markdown “source-of-truth” files.

**Tech Stack:** Next.js App Router, TypeScript, Zod, TanStack Query, Vitest, ESLint, Prettier, Markdown docs

---

## Scope Split

This request spans two mostly independent subsystems:

1. source-document query contract cleanup
2. living reference docs consolidation

They should land as two separate PRs even though they are captured in one plan file. Each track should stay independently shippable.

## File Map

- `src/modules/source-document/contract-schemas.ts`
  - Owns source-document query input contracts. Cursor format validation belongs here, not in query helpers.
- `src/modules/source-document/application/queries/source-document-queries.ts`
  - Owns paginated list query, bounded collection query, pending query, and detail query. Keep this file focused on query logic; do not introduce a generic query framework.
- `src/modules/source-document/server-actions/queries.ts`
  - Owns authenticated source-document query boundaries and public action names.
- `src/modules/source-document/actions.ts`
  - Public re-export barrel for source-document server actions.
- `src/modules/source-document/queries.ts`
  - Public re-export barrel for source-document read queries.
- `src/lib/query-keys.ts`
  - Owns query key naming for source-document page queries vs bounded collection queries.
- `src/modules/source-document/hooks/useSourceDocuments.ts`
  - Current stream-oriented client collection hook. Rename/re-scope this instead of layering a second abstraction on top.
- `src/modules/source-document/hooks/index.ts`
  - Public hook barrel for source-document client hooks.
- `src/modules/workspace/ui/LedgerEntriesTab.tsx`
  - Only stream UI consumer of the bounded collection query.
- `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`
  - Server-side workspace bootstrap that currently prefetches the bounded collection query.
- `tests/integration/source-document/source-document-query-actions.test.ts`
  - Action-boundary validation tests. Add cursor rejection coverage here.
- `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
  - Query behavior tests for paginated list and bounded collection behavior.
- `tests/unit/hooks/useSourceDocuments.test.ts`
  - Hook/query key coverage for the stream collection hook. Rename if the hook is renamed.
- `tests/unit/workspace/get-ledger-page-bootstrap.test.ts`
  - Ensures workspace bootstrap uses the renamed bounded collection query with explicit semantics.
- `docs/architecture/coding-patterns.md`
  - Canonical living engineering rules document after consolidation.
- `docs/architecture/PRD.md`
  - Single concise product reference after consolidation.
- `docs/architecture/UI.md`
  - Canonical UI reference; keep as-is unless a factual correction is required.
- `tests/unit/docs/living-reference-docs.test.ts`
  - New governance test to prevent the old reference-doc sprawl from coming back.

## Track A Rules

- Generic source-document listing stays cursor-based.
- The workspace stream may still use a bounded collection query, but it must have an explicit use-case name and explicit caller-owned limit.
- No more backward-compatible 2-segment cursor parsing.
- Do not introduce a repository layer, query builder abstraction, or “document service” layer for this cleanup.

## Track B Rules

- Keep exactly one PRD file.
- Keep `docs/architecture/UI.md`.
- Keep `docs/architecture/coding-patterns.md` as the only living engineering reference.
- Only merge durable rules into `coding-patterns.md`.
- Do not migrate long descriptive explanations, historical narratives, or per-variable environment tables into `coding-patterns.md`.
- Historical plan artifacts under `docs/superpowers/` are not part of this pass.

### Task 1: Reject Legacy Source-Document Cursors At The Boundary

**Files:**
- Modify: `src/modules/source-document/contract-schemas.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `tests/integration/source-document/source-document-query-actions.test.ts`
- Modify: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`

- [ ] **Step 1: Write the failing test for legacy cursor rejection**

```ts
it("rejects legacy two-segment cursors", async () => {
  await expect(
    listSourceDocuments(ledgerId, {
      cursor: "2026-03-23T10:00:00.000Z|doc-id",
    } as never)
  ).rejects.toThrow(ValidationError);
});
```

- [ ] **Step 2: Run the source-document query tests to verify the new case fails**

Run: `npm run test:integration -- tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
Expected: FAIL because the current schema accepts the legacy cursor shape.

- [ ] **Step 3: Tighten the cursor contract in `contract-schemas.ts`**

```ts
const sourceDocumentCursorSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}\|.+\|.+$/,
    "Invalid source document cursor"
  );

export const listSourceDocumentsInputSchema = strictObjectSchema({
  status: sourceDocumentStatusSchema.optional(),
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  cursor: sourceDocumentCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  includeEntries: z.coerce.boolean().default(false),
});
```

- [ ] **Step 4: Remove the 2-segment cursor branch from `source-document-queries.ts`**

```ts
function buildCursorCondition(cursor: string | null | undefined): SQL<unknown> | null {
  if (cursor == null || cursor === "") return null;

  const [cursorDate, cursorCreatedRaw, cursorId] = cursor.split("|");
  if (!cursorDate || !cursorCreatedRaw || !cursorId) return null;

  const cursorCreated = new Date(cursorCreatedRaw);
  if (Number.isNaN(cursorCreated.getTime())) return null;

  return or(
    lt(sourceDocuments.entryDate, cursorDate),
    and(eq(sourceDocuments.entryDate, cursorDate), lt(sourceDocuments.createdAt, cursorCreated)),
    and(
      eq(sourceDocuments.entryDate, cursorDate),
      eq(sourceDocuments.createdAt, cursorCreated),
      lt(sourceDocuments.id, cursorId)
    )
  ) ?? null;
}
```

- [ ] **Step 5: Run the targeted integration tests to verify they pass**

Run: `npm run test:integration -- tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/source-document/contract-schemas.ts \
  src/modules/source-document/application/queries/source-document-queries.ts \
  tests/integration/source-document/source-document-query-actions.test.ts \
  tests/integration/modules/source-document/application/queries/source-document-queries.test.ts
git commit -m "test: lock source-document cursor contract"
```

### Task 2: Rename And Narrow The Bounded Collection Query

**Files:**
- Modify: `src/modules/source-document/contract-schemas.ts`
- Modify: `src/modules/source-document/application/queries/source-document-queries.ts`
- Modify: `src/modules/source-document/server-actions/queries.ts`
- Modify: `src/modules/source-document/actions.ts`
- Modify: `src/modules/source-document/queries.ts`
- Modify: `src/lib/query-keys.ts`
- Modify: `src/modules/source-document/hooks/useSourceDocuments.ts`
- Modify: `src/modules/source-document/hooks/index.ts`
- Modify: `src/modules/workspace/ui/LedgerEntriesTab.tsx`
- Modify: `src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts`
- Modify: `tests/unit/hooks/useSourceDocuments.test.ts`
- Modify: `tests/unit/workspace/get-ledger-page-bootstrap.test.ts`
- Modify: `tests/integration/source-document/source-document-query-actions.test.ts`
- Modify: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`

- [ ] **Step 1: Write failing tests for the renamed bounded collection contract**

```ts
it("uses the bounded collection action with an explicit limit", async () => {
  renderHook(() =>
    useSourceDocumentCollection("ledger-1", {
      dateRange: {
        start: new Date("2026-03-01T00:00:00.000Z"),
        end: new Date("2026-03-31T00:00:00.000Z"),
      },
      minAmount: 20,
      maxAmount: 100,
    })
  );

  const queryOptions = useQueryMock.mock.calls[0]?.[0];
  expect(queryOptions.queryKey).toEqual(
    queryKeys.sourceDocumentCollection("ledger-1", {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      minAmount: 20,
      maxAmount: 100,
      limit: 1000,
    })
  );
});
```

- [ ] **Step 2: Run the targeted unit and integration tests to verify the rename breaks current callers**

Run: `npm run test:unit -- tests/unit/hooks/useSourceDocuments.test.ts tests/unit/workspace/get-ledger-page-bootstrap.test.ts`
Expected: FAIL because the old hook/action/query key names are still in place.

Run: `npm run test:integration -- tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
Expected: FAIL because the old collection action/query names are still in place.

- [ ] **Step 3: Rename the contract from “all documents” to an explicit bounded collection**

Use the existing DTO shape, but rename the functions and input schema so the use case is obvious:

```ts
export const sourceDocumentCollectionInputSchema = strictObjectSchema({
  startDate: optionalDateStringSchema,
  endDate: optionalDateStringSchema,
  minAmount: optionalQueryNumberSchema,
  maxAmount: optionalQueryNumberSchema,
  limit: z.coerce.number().int().min(1).max(1000),
});

export async function getSourceDocumentCollection(
  ledgerId: string,
  params: ListSourceDocumentCollectionInput
): Promise<SourceDocumentCollectionDto> {
  // no page/pageSize branch
}
```

- [ ] **Step 4: Rename the server/client/public entrypoints without adding a new abstraction layer**

Apply these direct renames:

```ts
// server-actions/queries.ts
export const getSourceDocumentCollectionAction = withLedgerAccess(...)

// actions.ts
export { getSourceDocumentCollectionAction } from "./server-actions/queries";

// queries.ts
export { getSourceDocumentCollection } from "./application/queries/source-document-queries";

// hook
export function useSourceDocumentCollection(...) { ... }
```

Keep the implementation in the existing source-document module and update the two existing workspace call sites. Do not create a generic collection service.

- [ ] **Step 5: Rename the query key to match the new contract**

```ts
sourceDocumentCollection: (
  ledgerId: string,
  params?: {
    startDate?: string | null;
    endDate?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    limit?: number | null;
  }
) => [
  "sourceDocuments",
  ledgerId,
  "collection",
  params?.startDate ?? null,
  params?.endDate ?? null,
  params?.minAmount ?? null,
  params?.maxAmount ?? null,
  params?.limit ?? null,
] as const,
```

- [ ] **Step 6: Make the workspace callers pass an explicit limit**

Use one local constant value (`1000`) in the two stream callers instead of a hidden schema fallback:

```ts
const STREAM_COLLECTION_LIMIT = 1000;

getSourceDocumentCollectionAction(ledgerId, {
  startDate,
  endDate,
  minAmount,
  maxAmount,
  limit: STREAM_COLLECTION_LIMIT,
});
```

Only the workspace stream and workspace bootstrap should use this bounded collection path after the rename.

- [ ] **Step 7: Run the targeted tests to verify the contract cleanup passes**

Run: `npm run test:unit -- tests/unit/hooks/useSourceDocuments.test.ts tests/unit/workspace/get-ledger-page-bootstrap.test.ts`
Expected: PASS

Run: `npm run test:integration -- tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/source-document/contract-schemas.ts \
  src/modules/source-document/application/queries/source-document-queries.ts \
  src/modules/source-document/server-actions/queries.ts \
  src/modules/source-document/actions.ts \
  src/modules/source-document/queries.ts \
  src/lib/query-keys.ts \
  src/modules/source-document/hooks/useSourceDocuments.ts \
  src/modules/source-document/hooks/index.ts \
  src/modules/workspace/ui/LedgerEntriesTab.tsx \
  src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts \
  tests/unit/hooks/useSourceDocuments.test.ts \
  tests/unit/workspace/get-ledger-page-bootstrap.test.ts \
  tests/integration/source-document/source-document-query-actions.test.ts \
  tests/integration/modules/source-document/application/queries/source-document-queries.test.ts
git commit -m "refactor: clarify source-document collection contract"
```

### Task 3: Add Living-Docs Governance Before Deleting Anything

**Files:**
- Create: `tests/unit/docs/living-reference-docs.test.ts`
- Modify: `docs/architecture/coding-patterns.md`

- [ ] **Step 1: Write the failing governance test for the allowed living reference docs**

```ts
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("living reference docs", () => {
  it("keeps only the approved architecture reference docs", () => {
    const architectureDir = path.join(process.cwd(), "docs/architecture");
    const docs = readdirSync(architectureDir).sort();
    expect(docs).toEqual(["PRD.md", "UI.md", "coding-patterns.md"]);
  });

  it("does not keep a docs/guides reference tree", () => {
    expect(existsSync(path.join(process.cwd(), "docs/guides"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the docs governance test to verify it fails**

Run: `npm run test:unit -- tests/unit/docs/living-reference-docs.test.ts`
Expected: FAIL because `docs/architecture` and `docs/guides` still contain extra files.

- [ ] **Step 3: Add a “Documentation Governance” section near the top of `coding-patterns.md`**

Add a short, durable section like this:

```md
## 0. 文档治理

- 活文档只保留三份：`docs/architecture/PRD.md`、`docs/architecture/UI.md`、`docs/architecture/coding-patterns.md`
- `PRD.md` 只描述当前产品范围与术语，不记录实现细节
- `UI.md` 只描述视觉与交互规范
- `coding-patterns.md` 只记录 durable engineering rules
- 运行时细节、环境变量、任务注册、HTTP 边界等以代码和测试为准；不要维护平行的描述性 Markdown 镜像
```

- [ ] **Step 4: Fold only durable rules from stale docs into `coding-patterns.md`**

Absorb these rules if they are still true in code:

- API v1 route handlers must use the shared credential + error boundary helper (`src/app/api/v1/_shared/route-helper.ts`)
- Background task registration remains centralized in `src/lib/flow/task-registry.ts`
- `entityType` / `entityId` must remain first-class task metadata
- `src/lib/env/catalog.ts` is the source of truth for environment variable definitions; do not keep a hand-maintained Markdown variable table

Do not import narrative sections, timelines, large ERDs, or operational runbooks into `coding-patterns.md`.

- [ ] **Step 5: Run the governance test again to verify it still fails only because files remain**

Run: `npm run test:unit -- tests/unit/docs/living-reference-docs.test.ts`
Expected: FAIL because extra docs still exist, but the new governance rule text is now in place.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/docs/living-reference-docs.test.ts docs/architecture/coding-patterns.md
git commit -m "test: add living docs governance"
```

### Task 4: Rewrite One Concise PRD And Delete The Duplicate

**Files:**
- Modify: `docs/architecture/PRD.md`
- Delete: `docs/architecture/PRD-lite.md`

- [ ] **Step 1: Replace the verbose PRD with a concise, verified product doc**

Use the current product behavior, not the stale Lite copy. Keep only:

- product overview
- target users / non-target users
- core capabilities
- core flows
- glossary

Correct known stale points while rewriting:

- auth is OTP + OIDC/SSO, not “Magic Link only”
- quick entry exists
- service credentials / API access exist
- AI processing is async

- [ ] **Step 2: Keep the rewritten PRD short enough to stay maintainable**

Target shape:

```md
# Cashier PRD

## Product Summary
## Target Users
## Core Capabilities
## Primary Flows
## Domain Terms
```

No historical narrative. No architecture section. No duplicated design rules. No duplicated environment tables.

- [ ] **Step 3: Delete `PRD-lite.md`**

After `PRD.md` is rewritten, remove the duplicate product doc entirely.

- [ ] **Step 4: Run the docs governance test to confirm the PRD duplicate is gone**

Run: `npm run test:unit -- tests/unit/docs/living-reference-docs.test.ts`
Expected: still FAIL because other stale docs remain, but `PRD-lite.md` is no longer part of the failure.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/PRD.md docs/architecture/PRD-lite.md tests/unit/docs/living-reference-docs.test.ts
git commit -m "docs: keep a single concise prd"
```

### Task 5: Delete Stale Descriptive Reference Docs

**Files:**
- Delete: `docs/architecture/architecture_overview.md`
- Delete: `docs/architecture/dev-preferences.md`
- Delete: `docs/architecture/ai_pipeline_architecture.md`
- Delete: `docs/architecture/database_schema.md`
- Delete: `docs/architecture/error_code_guide.md`
- Delete: `docs/guides/CONTRIBUTING.md`
- Delete: `docs/guides/deployment_guide.md`
- Delete: `docs/guides/development_setup.md`
- Delete: `docs/guides/ENV.md`
- Delete: `docs/guides/ERROR_HANDLING.md`
- Delete: `docs/guides/HTTP_API.md`
- Delete: `docs/guides/RUNBOOK.md`
- Delete: `docs/guides/TASK_HANDLERS.md`

- [ ] **Step 1: Search for references to the docs being deleted**

Run: `rg -n "architecture_overview|dev-preferences|ai_pipeline_architecture|database_schema|error_code_guide|HTTP_API|ENV|RUNBOOK|TASK_HANDLERS|PRD-lite" .`
Expected: only update references that still matter; remove dead links instead of adding redirects.

- [ ] **Step 2: Delete the stale reference docs**

Delete the files listed above after confirming any durable rule already lives in code or `coding-patterns.md`.

- [ ] **Step 3: Run the docs governance test and format the surviving docs**

Run: `npm run test:unit -- tests/unit/docs/living-reference-docs.test.ts`
Expected: PASS

Run: `npx prettier --write docs/architecture/PRD.md docs/architecture/UI.md docs/architecture/coding-patterns.md tests/unit/docs/living-reference-docs.test.ts`
Expected: files rewritten with no errors

- [ ] **Step 4: Commit**

```bash
git add docs/architecture docs/guides tests/unit/docs/living-reference-docs.test.ts
git commit -m "docs: remove stale reference markdown"
```

### Task 6: Final Verification

**Files:**
- Modify: none
- Test: `tests/integration/source-document/source-document-query-actions.test.ts`
- Test: `tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
- Test: `tests/unit/hooks/useSourceDocuments.test.ts`
- Test: `tests/unit/workspace/get-ledger-page-bootstrap.test.ts`
- Test: `tests/unit/docs/living-reference-docs.test.ts`

- [ ] **Step 1: Run the focused unit tests**

Run: `npm run test:unit -- tests/unit/hooks/useSourceDocuments.test.ts tests/unit/workspace/get-ledger-page-bootstrap.test.ts tests/unit/docs/living-reference-docs.test.ts`
Expected: PASS

- [ ] **Step 2: Run the focused integration tests**

Run: `npm run test:integration -- tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts`
Expected: PASS

- [ ] **Step 3: Run lint on the touched code and docs-adjacent tests**

Run: `npm run lint -- src/modules/source-document src/modules/workspace src/lib/query-keys.ts tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts tests/unit/hooks/useSourceDocuments.test.ts tests/unit/workspace/get-ledger-page-bootstrap.test.ts tests/unit/docs/living-reference-docs.test.ts`
Expected: PASS

- [ ] **Step 4: Run Prettier on the touched files**

Run: `npx prettier --check src/modules/source-document/contract-schemas.ts src/modules/source-document/application/queries/source-document-queries.ts src/modules/source-document/server-actions/queries.ts src/modules/source-document/actions.ts src/modules/source-document/queries.ts src/modules/source-document/hooks/useSourceDocuments.ts src/modules/workspace/ui/LedgerEntriesTab.tsx src/modules/workspace/application/queries/get-ledger-page-bootstrap.ts src/lib/query-keys.ts docs/architecture/PRD.md docs/architecture/UI.md docs/architecture/coding-patterns.md tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts tests/unit/hooks/useSourceDocuments.test.ts tests/unit/workspace/get-ledger-page-bootstrap.test.ts tests/unit/docs/living-reference-docs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the verification-only changes if formatting adjusted files**

```bash
git add src/modules/source-document src/modules/workspace src/lib/query-keys.ts docs/architecture tests/integration/source-document/source-document-query-actions.test.ts tests/integration/modules/source-document/application/queries/source-document-queries.test.ts tests/unit/hooks/useSourceDocuments.test.ts tests/unit/workspace/get-ledger-page-bootstrap.test.ts tests/unit/docs/living-reference-docs.test.ts
git commit -m "chore: verify source-document contract cleanup and docs consolidation"
```

## Notes For The Implementer

- Keep the source-document cleanup local. Do not introduce a new workspace service layer or generic collection abstraction.
- If renaming `useSourceDocuments` would create too much churn mid-PR, rename it in the same PR as the collection action/query key cleanup rather than carrying aliases.
- `docs/architecture/UI.md` is intentionally preserved. Only touch it if you discover a factual contradiction with the current UI.
- Do not attempt a “delete every markdown file in the repo” sweep in this pass. This plan only cleans the living reference docs that currently compete with `coding-patterns.md`.
