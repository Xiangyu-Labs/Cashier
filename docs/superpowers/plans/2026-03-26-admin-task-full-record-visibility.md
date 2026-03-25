# Admin Task Full Record Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/admin/tasks` so opening task details exposes the full stored `task_runs` record, including raw fields such as `input`, `deduplicationKey`, `tokenUsage`, `updatedAt`, and `deletedAt`, while preserving the existing scan-first task list.

**Architecture:** Keep the summary list contract payload-bounded and introduce a detail-specific admin query for a single task record. Drive detail expansion through a `detail=<task-id>` search param on `/admin/tasks`, so the server page can fetch one full task record on demand while the list remains summary-oriented. Render the full record through a dedicated detail panel and JSON-block subcomponents that preserve the existing admin visual language and keep raw payload sections collapsed by default.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Zod, next-intl, Tailwind, Vitest, Testing Library

---

## Scope Check

This plan covers one bounded follow-up to the existing admin tasks page: complete read-only visibility for a single `task_runs` record once the user opens task details. It does **not** add task mutations, a new `/admin/tasks/[id]` route, clipboard/export features, or log-analysis tooling.

## File Map

- `src/modules/admin/contracts.ts`
  - Expand admin task contracts with a new detail-specific type for full `task_runs` record visibility while keeping the existing summary list item type bounded.
- `src/modules/admin/application/queries/get-admin-task-detail.ts`
  - New admin-only query that loads one full `task_runs` row, includes read-only user enrichment, and returns the raw fields needed by the detail viewer.
- `src/modules/admin/application/queries/list-admin-tasks.ts`
  - Preserve current summary-list behavior; do not inflate the list payload with full raw fields.
- `src/modules/admin/queries.ts`
  - Export the new `getAdminTaskDetail` query.
- `src/app/[locale]/(protected)/admin/tasks/page.tsx`
  - Read optional `detail` search param, fetch detail only when requested, and pass summary + detail payloads into the UI.
- `src/modules/admin/ui/AdminTasksList.tsx`
  - Stop owning detail state locally; instead render the expanded row when `expandedTaskId` and `expandedTaskDetail` are provided by the page layer.
- `src/modules/admin/ui/AdminTaskDetailPanel.tsx`
  - New focused detail-view component for grouped raw-field and derived-field presentation.
- `src/modules/admin/ui/AdminTaskJsonBlock.tsx`
  - New focused UI primitive for formatted raw payload blocks with explicit empty-state rendering rules and default-collapsed behavior.
- `src/modules/admin/ui/index.ts`
  - Export the new detail UI pieces.
- `messages/en.json`
  - Add detail labels for the missing raw fields and JSON-section controls.
- `messages/zh.json`
  - Add the same labels in Chinese.
- `tests/unit/modules/admin/get-admin-task-detail.test.ts`
  - New query-contract tests for the single-task detail path.
- `tests/unit/modules/admin/list-admin-tasks.test.ts`
  - Add a guard that the list contract remains summary-oriented and keeps stable ordering/pagination behavior.
- `tests/unit/app/admin-route-composition.test.tsx`
  - Extend route composition coverage for `detail` search-param wiring.
- `tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
  - Update list tests so expansion is driven by page-provided detail props, not local hidden summary-only state.
- `tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx`
  - New focused tests for full field grouping, scalar empty-state behavior, and raw-vs-derived labeling.
- `tests/unit/modules/admin/ui/AdminTaskJsonBlock.test.tsx`
  - New focused tests for JSON empty-state rendering, containment classes, overflow handling, and formatted block behavior.

## Non-Goals

- Do not add `/admin/tasks/[id]`.
- Do not preload full raw payloads for every list row.
- Do not add copy/download/export controls.
- Do not add field search or task editing.
- Do not add modal/drawer UI or dashboard-style summary cards.

### Task 1: Add A Detail-Specific Admin Query Contract

**Files:**
- Modify: `src/modules/admin/contracts.ts`
- Create: `src/modules/admin/application/queries/get-admin-task-detail.ts`
- Modify: `src/modules/admin/queries.ts`
- Create: `tests/unit/modules/admin/get-admin-task-detail.test.ts`
- Modify: `tests/unit/modules/admin/list-admin-tasks.test.ts`
- Reference: `src/modules/admin/application/queries/list-admin-tasks.ts`
- Reference: `src/persistence/schema/task-queue.ts`
- Reference: `src/modules/task-queue/contract-schemas.ts`

- [ ] **Step 1: Write the failing detail-query tests first**

Create `tests/unit/modules/admin/get-admin-task-detail.test.ts` using the real test DB and mocked `requireSuperAdmin`, following the pattern already used in `tests/unit/modules/admin/list-admin-tasks.test.ts`.

Write tests that lock these behaviors:

```ts
it("returns the full stored task_runs record for a visible task", async () => {
  const result = await getAdminTaskDetail("11111111-1111-4111-8111-111111111111");

  expect(result).toMatchObject({
    id: "11111111-1111-4111-8111-111111111111",
    type: "parse_source_document",
    title: "Parse source document",
    input: { sourceDocumentId: "doc-1" },
    deduplicationKey: "parse:doc-1",
    scopeId: "ledger-1",
    entityType: "source_document",
    entityId: "doc-1",
    status: "failed",
    error: "AI returned invalid JSON",
    progress: "50%",
    tokenUsage: { total: { input: 10, output: 20 } },
    createdAt: new Date("2026-03-26T10:00:00.000Z"),
    updatedAt: new Date("2026-03-26T10:01:00.000Z"),
    startedAt: new Date("2026-03-26T10:00:10.000Z"),
    completedAt: new Date("2026-03-26T10:00:40.000Z"),
    deletedAt: null,
    scopeUserEmail: "owner@example.com",
  });
});

it("requires super-admin access before reading detail", async () => {
  await expect(getAdminTaskDetail("11111111-1111-4111-8111-111111111111")).rejects.toThrow("forbidden");
});

it("throws NotFoundError for a missing or soft-deleted task", async () => {
  await expect(getAdminTaskDetail("22222222-2222-4222-8222-222222222222")).rejects.toBeInstanceOf(NotFoundError);
});
```

Also extend `tests/unit/modules/admin/list-admin-tasks.test.ts` with one assertion that the summary list remains summary-oriented:

```ts
expect(firstPage.items[0]).not.toHaveProperty("input");
expect(firstPage.items[0]).not.toHaveProperty("tokenUsage");
```

- [ ] **Step 2: Run the new admin query tests to verify the missing detail path fails correctly**

Run:

```bash
npm run test:unit -- tests/unit/modules/admin/get-admin-task-detail.test.ts tests/unit/modules/admin/list-admin-tasks.test.ts
```

Expected: FAIL because `getAdminTaskDetail` and the new detail contract do not exist yet.

- [ ] **Step 3: Add the detail contract and reuse the existing task-id parser**

Update `src/modules/admin/contracts.ts` so the current bounded list item stays intact and a separate full-detail type is introduced.

Create a new type like:

```ts
export interface AdminTaskDetail {
  id: string;
  type: string;
  title: string;
  input: unknown;
  deduplicationKey: string | null;
  scopeId: string | null;
  scopeUserEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  status: AdminTaskStatus;
  error: string | null;
  progress: string | null;
  tokenUsage: unknown;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  deletedAt: Date | null;
}
```

Do **not** create a second admin-only task-id parser. Reuse the existing UUID validation helper from `src/modules/task-queue/contract-schemas.ts`:

```ts
import { parseTaskId } from "@/modules/task-queue/contract-schemas";

const taskId = parseTaskId(input);
```

That keeps task-id validation consistent across task-related code paths.

- [ ] **Step 4: Implement `getAdminTaskDetail` with read-only enrichment and full raw fields**

Create `src/modules/admin/application/queries/get-admin-task-detail.ts`.

Implementation requirements:

- call `await requireSuperAdmin()` first
- validate the incoming task id
- read exactly one undeleted `task_runs` row
- enrich `scopeUserEmail` via `ledgers -> users`
- return all currently stored raw fields listed in the spec
- throw a repository-standard not-found style error if the task does not exist or is soft-deleted

The query shape should look like:

```ts
const row = await db
  .select({
    id: taskRuns.id,
    type: taskRuns.type,
    title: taskRuns.title,
    input: taskRuns.input,
    deduplicationKey: taskRuns.deduplicationKey,
    scopeId: taskRuns.scopeId,
    scopeUserEmail: users.email,
    entityType: taskRuns.entityType,
    entityId: taskRuns.entityId,
    status: taskRuns.status,
    error: taskRuns.error,
    progress: taskRuns.progress,
    tokenUsage: taskRuns.tokenUsage,
    createdAt: taskRuns.createdAt,
    updatedAt: taskRuns.updatedAt,
    startedAt: taskRuns.startedAt,
    completedAt: taskRuns.completedAt,
    deletedAt: taskRuns.deletedAt,
  })
  .from(taskRuns)
  .leftJoin(ledgers, and(eq(taskRuns.scopeId, ledgers.id), isNull(ledgers.deletedAt)))
  .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
  .where(and(eq(taskRuns.id, taskId), isNull(taskRuns.deletedAt)))
  .limit(1);
```

Update `src/modules/admin/queries.ts` to export the new query.

- [ ] **Step 5: Re-run the new query tests**

Run:

```bash
npm run test:unit -- tests/unit/modules/admin/get-admin-task-detail.test.ts tests/unit/modules/admin/list-admin-tasks.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/admin/contracts.ts \
  src/modules/admin/application/queries/get-admin-task-detail.ts \
  src/modules/admin/queries.ts \
  tests/unit/modules/admin/get-admin-task-detail.test.ts \
  tests/unit/modules/admin/list-admin-tasks.test.ts
git commit -m "feat: add admin task detail query"
```

### Task 2: Wire Detail Expansion Through The Page URL Instead Of Preloading Every Record

**Files:**
- Modify: `src/app/[locale]/(protected)/admin/tasks/page.tsx`
- Modify: `src/modules/admin/ui/AdminTasksList.tsx`
- Modify: `src/modules/admin/contracts.ts`
- Modify: `tests/unit/app/admin-route-composition.test.tsx`
- Modify: `tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
- Reference: `src/components/LanguageSwitcher.tsx`
- Reference: `src/modules/admin/ui/AdminTaskFilters.tsx`

- [ ] **Step 1: Write the failing route-composition and list-state tests for `detail=<task-id>` wiring**

Extend `tests/unit/app/admin-route-composition.test.tsx` so the tasks page covers both sides of the lazy detail contract:

- when `detail` is present, `getAdminTaskDetail` is called
- when `detail` is absent, `getAdminTaskDetail` is not called
- no-data and filtered-empty results still render through the page wiring
- task-query failures still bubble so the existing admin error boundary can handle them

Add a test like:

```ts
it("loads full detail only for the selected task id", async () => {
  listAdminTasksMock.mockResolvedValueOnce(summaryResult);
  getAdminTaskDetailMock.mockResolvedValueOnce(detailResult);

  const TasksPage = (await import("@/app/[locale]/(protected)/admin/tasks/page")).default;
  render(
    await TasksPage({
      searchParams: Promise.resolve({ detail: "task-1", status: "failed" }),
    })
  );

  expect(getAdminTaskDetailMock).toHaveBeenCalledWith("task-1");
  expect(screen.getByText("Task ID")).toBeTruthy();
});
```

Update `tests/unit/modules/admin/ui/AdminTasksList.test.tsx` so expansion is driven by explicit props rather than local hidden state. Replace the current “click Details and local state expands” contract with a URL-shaped contract such as:

```ts
render(
  <AdminTasksList
    expandedTaskId="task-1"
    expandedTaskDetail={detail}
    ...
  />
);

expect(screen.getByText("Task ID")).toBeTruthy();
```

Also add checks that the Details/Hide details links preserve the current page cursor as well as the current filters. Use an explicit `currentCursor` prop from the page layer rather than reusing `nextCursor`:

```ts
expect(detailsLink.getAttribute("href")).toBe(
  "/admin/tasks?status=failed&type=parse_source_document&range=7d&limit=50&cursor=2026-03-20T00%3A00%3A00.000Z%7Ctask-99&detail=11111111-1111-4111-8111-111111111111"
);

expect(hideDetailsLink.getAttribute("href")).toBe(
  "/admin/tasks?status=failed&type=parse_source_document&range=7d&limit=50&cursor=2026-03-20T00%3A00%3A00.000Z%7Ctask-99"
);
```

- [ ] **Step 2: Run the route/list tests to verify the current local-state implementation fails the new contract**

Run:

```bash
npm run test:unit -- tests/unit/app/admin-route-composition.test.tsx tests/unit/modules/admin/ui/AdminTasksList.test.tsx
```

Expected: FAIL because the page does not yet read `detail`, and the list still owns expansion locally.

- [ ] **Step 3: Update the server page to fetch one detail record on demand**

Modify `src/app/[locale]/(protected)/admin/tasks/page.tsx`.

Requirements:

- normalize `detail` from `searchParams`
- keep the existing summary query untouched for list behavior
- call `getAdminTaskDetail(detail)` only when `detail` is present
- pass `expandedTaskId`, `expandedTaskDetail`, and the current page cursor separately into the UI

The page flow should look like:

```ts
const selectedTaskId = getSingleSearchParam(resolvedSearchParams.detail);
const tasks = await listAdminTasks(normalizedSearchParams);
const expandedTaskDetail =
  selectedTaskId != null ? await getAdminTaskDetail(selectedTaskId) : null;
```

- [ ] **Step 4: Update `AdminTasksList` to use URL-driven detail selection**

Stop using local `useState` for the primary expand/collapse decision.

Instead:

- add `currentCursor?: string | null` to the list-page UI contract (either inside `AdminTaskFiltersState` or as a separate prop)
- accept `expandedTaskId?: string`
- accept `expandedTaskDetail?: AdminTaskDetail | null`
- build `Details` / `Hide details` links that preserve `status`, `type`, `range`, `limit`, and the current page `cursor` while adding or removing `detail`
- keep the inline expanded row behavior exactly on the current page, just driven by props

A small helper should generate the detail href from current page state, not from `nextCursor`:

```ts
function buildTaskDetailHref(
  filters: AdminTaskFiltersState,
  taskId: string | null,
  currentCursor?: string | null
) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.range !== "all") params.set("range", filters.range);
  if (filters.limit) params.set("limit", filters.limit);
  if (currentCursor) params.set("cursor", currentCursor);
  if (taskId) params.set("detail", taskId);
  return `/admin/tasks?${params.toString()}`;
}
```

Do **not** introduce a new route, modal, or drawer.

- [ ] **Step 5: Re-run the route/list tests**

Run:

```bash
npm run test:unit -- tests/unit/app/admin-route-composition.test.tsx tests/unit/modules/admin/ui/AdminTasksList.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add 'src/app/[locale]/(protected)/admin/tasks/page.tsx' \
  src/modules/admin/ui/AdminTasksList.tsx \
  tests/unit/app/admin-route-composition.test.tsx \
  tests/unit/modules/admin/ui/AdminTasksList.test.tsx
git commit -m "feat: drive admin task details through search params"
```

### Task 3: Build The Full Record Detail Panel And Raw JSON Blocks

**Files:**
- Create: `src/modules/admin/ui/AdminTaskDetailPanel.tsx`
- Create: `src/modules/admin/ui/AdminTaskJsonBlock.tsx`
- Modify: `src/modules/admin/ui/AdminTasksList.tsx`
- Modify: `src/modules/admin/contracts.ts`
- Modify: `src/modules/admin/ui/index.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Create: `tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx`
- Create: `tests/unit/modules/admin/ui/AdminTaskJsonBlock.test.tsx`
- Modify: `tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
- Reference: `src/modules/admin/ui/AdminUsersList.tsx`
- Reference: `src/components/ui/button.tsx`

- [ ] **Step 1: Write the failing detail-panel tests for full field coverage and raw-data behavior**

Create `tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx`.

Cover at least:

- all grouped scalar fields render under the intended sections
- `input` and `tokenUsage` appear in dedicated formatted blocks
- the raw-data section is collapsed by default
- opening the raw-data section reveals both payload blocks
- raw JSON empty states follow the spec
  - absent => `—`
  - `null` => `null`
  - empty string => `""`
  - empty object => `{}`
  - empty array => `[]`
- ordinary scalar empty/null states still render `—`
- derived helper fields (`scopeUserEmail`, `duration`) render under distinct labels

Example test sketch:

```ts
it("renders all raw task_runs fields and keeps raw payloads collapsed by default", async () => {
  render(<AdminTaskDetailPanel detail={detail} labels={labels} />);

  expect(screen.getByText("Task ID")).toBeTruthy();
  expect(screen.getByText("Updated At")).toBeTruthy();
  expect(screen.queryByText('{\n  "sourceDocumentId": "doc-1"\n}')).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Show raw data" }));

  expect(screen.getByText('{\n  "sourceDocumentId": "doc-1"\n}')).toBeTruthy();
  expect(screen.getByText('{\n  "total": {\n    "input": 10,\n    "output": 20\n  }\n}')).toBeTruthy();
});
```

- [ ] **Step 2: Run the new detail-panel and JSON-block tests to verify they fail**

Run:

```bash
npm run test:unit -- tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx tests/unit/modules/admin/ui/AdminTaskJsonBlock.test.tsx tests/unit/modules/admin/ui/AdminTasksList.test.tsx
```

Expected: FAIL because the dedicated detail panel and JSON block do not exist yet.

- [ ] **Step 3: Add translations for the newly visible raw fields and section controls**

Update `messages/en.json` and `messages/zh.json` under `AdminTasks`.

Add labels for at least:

```json
"input": "Input",
"deduplicationKey": "Deduplication Key",
"updatedAt": "Updated At",
"deletedAt": "Deleted At",
"tokenUsage": "Token Usage",
"taskBasics": "Task Basics",
"scopeAndEntity": "Scope & Entity",
"timing": "Timing",
"execution": "Execution",
"rawData": "Raw Data",
"showRawData": "Show raw data",
"hideRawData": "Hide raw data",
"scopeUserEmail": "Scope User Email",
"notAvailable": "—"
```

Add Chinese equivalents too.

- [ ] **Step 4: Implement `AdminTaskJsonBlock` with explicit empty-state formatting rules**

Create a small focused component that accepts `label`, `value`, and empty-state labels.

Implementation rules:

- if value is `undefined` => render `—`
- if value is `null` => render `null`
- if value is `""` => render `""`
- if value is `[]` => render `[]`
- if value is `{}` => render `{}`
- if value is JSON-serializable structured data => pretty-print with `JSON.stringify(value, null, 2)`
- if value is a non-JSON raw string => render the string literally in a preformatted block
- the raw block wrapper must include explicit safe-overflow treatment (for example `overflow-x-auto`, `max-h-*`, and a bordered `surface2` container)
- the preformatted content must preserve readability (`whitespace-pre-wrap` or equivalent) while remaining selectable

- [ ] **Step 5: Implement `AdminTaskDetailPanel` and plug it into the expanded row**

Create `src/modules/admin/ui/AdminTaskDetailPanel.tsx` with the five approved sections:

1. Task basics
2. Scope and entity
3. Timing
4. Execution
5. Raw data

Keep raw data collapsed by default with a simple local boolean only for the raw-data subsection. That local state is acceptable because it is display-only and does not control which record is loaded.

Then update `AdminTasksList.tsx` so the expanded row renders:

```tsx
<AdminTaskDetailPanel detail={expandedTaskDetail} labels={detailLabels} />
```

Do not leave the full field rendering inline inside `AdminTasksList.tsx`; move it into the dedicated panel component so the table remains focused.

- [ ] **Step 6: Re-run the UI tests**

Run:

```bash
npm run test:unit -- tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx tests/unit/modules/admin/ui/AdminTaskJsonBlock.test.tsx tests/unit/modules/admin/ui/AdminTasksList.test.tsx
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/ui/AdminTaskDetailPanel.tsx \
  src/modules/admin/ui/AdminTaskJsonBlock.tsx \
  src/modules/admin/ui/AdminTasksList.tsx \
  src/modules/admin/ui/index.ts \
  messages/en.json \
  messages/zh.json \
  tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx \
  tests/unit/modules/admin/ui/AdminTaskJsonBlock.test.tsx \
  tests/unit/modules/admin/ui/AdminTasksList.test.tsx
git commit -m "feat: add full admin task record detail panel"
```

### Task 4: Run Final Verification And Freeze The Follow-Up

**Files:**
- Modify: `src/app/[locale]/(protected)/admin/tasks/page.tsx`
- Modify: `src/modules/admin/application/queries/get-admin-task-detail.ts`
- Modify: `src/modules/admin/ui/AdminTaskDetailPanel.tsx`
- Modify: `src/modules/admin/ui/AdminTasksList.tsx`
- Modify: `src/modules/admin/contracts.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Test: `tests/unit/modules/admin/get-admin-task-detail.test.ts`
- Test: `tests/unit/modules/admin/list-admin-tasks.test.ts`
- Test: `tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx`
- Test: `tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
- Test: `tests/unit/app/admin-route-composition.test.tsx`

- [ ] **Step 1: Re-check the implementation against the follow-up spec before broad verification**

Read `docs/superpowers/specs/2026-03-26-admin-task-full-record-visibility-design.md` and confirm these constraints in code review:

- list summary columns remain unchanged
- no new route/drawer/modal was added
- raw-data section is collapsed by default
- all required raw fields are visible after opening task details
- no mutation affordances exist

- [ ] **Step 2: Run the targeted admin verification suite**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/admin/get-admin-task-detail.test.ts \
  tests/unit/modules/admin/list-admin-tasks.test.ts \
  tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx \
  tests/unit/modules/admin/ui/AdminTasksList.test.tsx \
  tests/unit/app/admin-route-composition.test.tsx
```

Expected: PASS

- [ ] **Step 3: Run lint on the touched admin files**

Run:

```bash
npm run lint -- \
  'src/app/[locale]/(protected)/admin/tasks/page.tsx' \
  src/modules/admin
```

Expected: PASS

- [ ] **Step 4: Run TypeScript and i18n validation**

Run:

```bash
npm run tsc
npm run validate:i18n
```

Expected: PASS

- [ ] **Step 5: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 6: Commit the finished follow-up**

```bash
git add 'src/app/[locale]/(protected)/admin/tasks/page.tsx' \
  src/modules/admin \
  messages/en.json \
  messages/zh.json \
  tests/unit/modules/admin/get-admin-task-detail.test.ts \
  tests/unit/modules/admin/list-admin-tasks.test.ts \
  tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx \
  tests/unit/modules/admin/ui/AdminTasksList.test.tsx \
  tests/unit/app/admin-route-composition.test.tsx
git commit -m "feat: expose full admin task record details"
```
