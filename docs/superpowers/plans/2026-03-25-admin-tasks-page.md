# Admin Tasks Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only `/admin/tasks` page that lets `super_admin` users inspect backend task history with newest-first ordering, stable filters, cursor pagination, and inline task details.

**Architecture:** Keep the feature admin-owned end to end. Add a dedicated admin query around `task_runs` with Zod-validated URL input, cursor pagination, and read-only ledger/user enrichment; then wire a server page that passes translated labels and validated results into small admin UI components for filters, status badges, and expandable rows. Do not reuse the ledger task-queue query because that query is ledger-scoped and mixes source-document anomaly state into task results.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Zod, next-intl, Radix Select, Tailwind, Vitest, Testing Library

---

## Scope Check

This plan covers one coherent subsystem: a read-only admin task-history page. It does **not** include task mutations, anomaly review, OTP/security monitoring, or dashboard-style analytics. Those remain separate future specs.

## File Map

- `src/modules/admin/contracts.ts`
  - New admin-owned DTO and filter/result types for the tasks page.
- `src/modules/admin/contract-schemas.ts`
  - New Zod schemas and parse helpers for `status`, `type`, `range`, `cursor`, and `limit`.
- `src/modules/admin/application/queries/list-admin-tasks.ts`
  - New admin-only query for `task_runs`, including `requireSuperAdmin`, read-only joins to `ledgers` and `users`, `availableTypes`, `hasAnyTasks`, and cursor pagination.
- `src/modules/admin/queries.ts`
  - Export the new `listAdminTasks` query alongside `listAdminUsers`.
- `src/app/[locale]/(protected)/admin/layout.tsx`
  - Add the `Tasks` navigation item.
- `src/app/[locale]/(protected)/admin/tasks/page.tsx`
  - New server page that reads `searchParams`, loads translations, calls `listAdminTasks`, and renders the admin tasks UI.
- `src/modules/admin/ui/AdminTaskStatusBadge.tsx`
  - New small UI primitive mapping task status -> existing `Badge` variants.
- `src/modules/admin/ui/AdminTaskFilters.tsx`
  - New client component for URL-driven `status` / `type` / `range` filters and reset behavior.
- `src/modules/admin/ui/AdminTasksList.tsx`
  - New client component for the bordered task table, empty states, expandable detail rows, and “next page” navigation.
- `src/modules/admin/ui/index.ts`
  - Export the new admin task UI components.
- `messages/en.json`
  - Add `Admin.tasks` and a new `AdminTasks` namespace.
- `messages/zh.json`
  - Add `Admin.tasks` and a new `AdminTasks` namespace.
- `tests/unit/modules/admin/list-admin-tasks.test.ts`
  - New admin query characterization tests with the real test DB.
- `tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx`
  - New URL-update tests for the filter bar.
- `tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
  - New rendering tests for rows, empty states, expansion, and pagination link behavior.
- `tests/unit/modules/admin/ui/AdminShell.test.tsx`
  - Add the new nav item to the existing admin shell contract.
- `tests/unit/app/admin-route-composition.test.tsx`
  - Add `/admin/tasks` page composition coverage.

## Non-Goals

- Do not add retry, cancel, dismiss, or delete buttons.
- Do not mix source-document anomaly rows into the admin task page.
- Do not add graphs, KPI cards, or a dashboard summary wall.
- Do not invent “bad backlog”, “abnormal user”, or “security anomaly” heuristics.
- Do not add a task detail route in this batch.

### Task 1: Lock The Admin Task Query Contract First

**Files:**
- Create: `src/modules/admin/contracts.ts`
- Create: `src/modules/admin/contract-schemas.ts`
- Create: `src/modules/admin/application/queries/list-admin-tasks.ts`
- Modify: `src/modules/admin/queries.ts`
- Create: `tests/unit/modules/admin/list-admin-tasks.test.ts`
- Reference: `src/modules/admin/application/queries/list-admin-users.ts`
- Reference: `tests/helpers/schema-setup.ts`
- Reference: `src/modules/ledger/application/queries/list-ledger-entry-page.ts`

- [ ] **Step 1: Write the failing query tests for sorting, filters, enrichment, and pagination**

Create `tests/unit/modules/admin/list-admin-tasks.test.ts` with the real test DB and a mocked `requireSuperAdmin`, following the same pattern as `tests/unit/modules/admin/list-admin-users.test.ts`.

Seed `users`, `ledgers`, and `task_runs` directly so the test locks the exact contract you want:

```ts
import { and, sql } from "drizzle-orm";
import { getTestDb } from "tests/setup";
import { ledgers, taskRuns, users } from "@/persistence";
import { listAdminTasks } from "@/modules/admin/queries";

it("returns newest tasks first and enriches ledger-scoped rows with user email", async () => {
  const db = getTestDb();
  await db.run(sql`DELETE FROM task_runs`);
  await db.run(sql`DELETE FROM ledgers`);
  await db.run(sql`DELETE FROM users`);

  await db.insert(users).values({
    id: "user-1",
    email: "owner@example.com",
    emailVerified: new Date(),
    name: "Owner",
    role: "super_admin",
  });

  await db.insert(ledgers).values({ id: "ledger-1", userId: "user-1", metadata: {} });

  await db.insert(taskRuns).values([
    {
      id: "task-new",
      type: "parse_source_document",
      title: "Parse source document",
      scopeId: "ledger-1",
      entityType: "source_document",
      entityId: "doc-1",
      status: "failed",
      error: "AI returned invalid JSON",
      createdAt: new Date("2026-03-25T10:00:00.000Z"),
    },
    {
      id: "task-old",
      type: "generate_category_metadata",
      title: "Generate metadata",
      status: "completed",
      createdAt: new Date("2026-03-24T10:00:00.000Z"),
    },
  ]);

  const result = await listAdminTasks({ limit: 50 });

  expect(result.items.map((item) => item.id)).toEqual(["task-new", "task-old"]);
  expect(result.items[0]).toMatchObject({ scopeUserEmail: "owner@example.com" });
  expect(result.availableTypes).toEqual([
    "generate_category_metadata",
    "parse_source_document",
  ]);
});
```

Add at least three more tests:

- `requires super-admin access before querying tasks`
- `filters by status, type, and range`
- `returns nextCursor and hasAnyTasks correctly when the limit is exceeded`

- [ ] **Step 2: Run the new query test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/admin/list-admin-tasks.test.ts`
Expected: FAIL because `listAdminTasks`, the admin task contracts, and parser do not exist yet.

- [ ] **Step 3: Create the admin task contracts and validated input parser**

Create `src/modules/admin/contracts.ts` with focused types instead of leaking raw Drizzle row shapes into the UI.

Start with a small contract surface like:

```ts
export type AdminTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AdminTaskRange = "24h" | "7d" | "30d" | "all";

export interface AdminTaskListItem {
  id: string;
  status: AdminTaskStatus;
  type: string;
  title: string;
  progress: string | null;
  error: string | null;
  scopeId: string | null;
  scopeUserEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface AdminTaskPageResult {
  items: AdminTaskListItem[];
  nextCursor: string | null;
  availableTypes: string[];
  hasAnyTasks: boolean;
}
```

Create `src/modules/admin/contract-schemas.ts` with a strict parser:

```ts
const adminTaskStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

const adminTaskRangeSchema = z.enum(["24h", "7d", "30d", "all"]);

export const listAdminTasksInputSchema = strictObjectSchema({
  status: adminTaskStatusSchema.optional(),
  type: z.string().trim().min(1).optional(),
  range: adminTaskRangeSchema.default("all"),
  cursor: z.string().regex(/^.+\|.+$/, "Invalid admin task cursor").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
```

Expose a `parseListAdminTasksInput` helper that throws `ValidationError` on bad input.

- [ ] **Step 4: Implement the admin task query with cursor pagination and read-only joins**

Create `src/modules/admin/application/queries/list-admin-tasks.ts`.

Implementation rules:

- call `await requireSuperAdmin()` first
- ignore soft-deleted task rows (`isNull(taskRuns.deletedAt)`)
- join `ledgers` and `users` read-only to populate `scopeUserEmail`
- return `availableTypes` from a separate `selectDistinct` query
- return `hasAnyTasks` from an unfiltered count of undeleted task rows
- order rows by `createdAt desc`, `id desc`
- generate the cursor as `createdAtISOString|id`

Cursor condition should mirror the ledger pattern:

```ts
const cursorCondition =
  cursor == null
    ? null
    : or(
        lt(taskRuns.createdAt, cursorCreatedAt),
        and(eq(taskRuns.createdAt, cursorCreatedAt), lt(taskRuns.id, cursorId))
      );
```

The main query shape should look like:

```ts
const rows = await db
  .select({
    id: taskRuns.id,
    status: taskRuns.status,
    type: taskRuns.type,
    title: taskRuns.title,
    progress: taskRuns.progress,
    error: taskRuns.error,
    scopeId: taskRuns.scopeId,
    scopeUserEmail: users.email,
    entityType: taskRuns.entityType,
    entityId: taskRuns.entityId,
    createdAt: taskRuns.createdAt,
    startedAt: taskRuns.startedAt,
    completedAt: taskRuns.completedAt,
  })
  .from(taskRuns)
  .leftJoin(ledgers, eq(taskRuns.scopeId, ledgers.id))
  .leftJoin(users, and(eq(ledgers.userId, users.id), isNull(users.deletedAt)))
  .where(and(...conditions))
  .orderBy(desc(taskRuns.createdAt), desc(taskRuns.id))
  .limit(validated.limit + 1);
```

Update `src/modules/admin/queries.ts` to export `listAdminTasks`.

- [ ] **Step 5: Re-run the admin task query tests**

Run: `npm run test:unit -- tests/unit/modules/admin/list-admin-tasks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/admin/contracts.ts \
  src/modules/admin/contract-schemas.ts \
  src/modules/admin/application/queries/list-admin-tasks.ts \
  src/modules/admin/queries.ts \
  tests/unit/modules/admin/list-admin-tasks.test.ts
git commit -m "feat: add admin task listing query"
```

### Task 2: Wire The Admin Route, Navigation, And Translations

**Files:**
- Create: `src/app/[locale]/(protected)/admin/tasks/page.tsx`
- Modify: `src/app/[locale]/(protected)/admin/layout.tsx`
- Modify: `src/modules/admin/ui/index.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Modify: `tests/unit/modules/admin/ui/AdminShell.test.tsx`
- Modify: `tests/unit/app/admin-route-composition.test.tsx`
- Reference: `src/app/[locale]/(protected)/admin/users/page.tsx`

- [ ] **Step 1: Write the failing navigation and route-composition tests**

Extend `tests/unit/modules/admin/ui/AdminShell.test.tsx` so the nav contract includes a `Tasks` link.

Add a new route-composition test in `tests/unit/app/admin-route-composition.test.tsx` that mocks `listAdminTasks` and verifies the new page passes search params through to the query and renders task content.

Example:

```ts
const { requireSuperAdminMock, listAdminUsersMock, listAdminTasksMock, redirectMock } = vi.hoisted(
  () => ({
    requireSuperAdminMock: vi.fn(),
    listAdminUsersMock: vi.fn(),
    listAdminTasksMock: vi.fn(),
    redirectMock: vi.fn(),
  })
);

vi.mock("@/modules/admin/queries", () => ({
  listAdminUsers: listAdminUsersMock,
  listAdminTasks: listAdminTasksMock,
}));

it("wires the tasks page to the admin task query", async () => {
  listAdminTasksMock.mockResolvedValueOnce({
    items: [
      {
        id: "task-1",
        status: "failed",
        type: "parse_source_document",
        title: "Parse source document",
        progress: null,
        error: "AI returned invalid JSON",
        scopeId: "ledger-1",
        scopeUserEmail: "owner@example.com",
        entityType: "source_document",
        entityId: "doc-1",
        createdAt: new Date("2026-03-25T10:00:00.000Z"),
        startedAt: null,
        completedAt: null,
      },
    ],
    nextCursor: null,
    availableTypes: ["parse_source_document"],
    hasAnyTasks: true,
  });

  const TasksPage = (await import("@/app/[locale]/(protected)/admin/tasks/page")).default;
  render(
    await TasksPage({
      searchParams: Promise.resolve({ status: "failed", range: "7d" }),
    })
  );

  expect(listAdminTasksMock).toHaveBeenCalledWith(
    expect.objectContaining({ status: "failed", range: "7d" })
  );
  expect(screen.getByText("Parse source document")).toBeTruthy();
});
```

- [ ] **Step 2: Run the admin shell and route tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminShell.test.tsx tests/unit/app/admin-route-composition.test.tsx`
Expected: FAIL because the tasks nav item, messages, and route do not exist yet.

- [ ] **Step 3: Add the tasks nav item and localized labels**

Update `messages/en.json` and `messages/zh.json`.

Minimum new copy:

```json
"Admin": {
  "tasks": "Tasks"
},
"AdminTasks": {
  "title": "Tasks",
  "description": "Read-only visibility into backend task history.",
  "status": "Status",
  "type": "Type",
  "range": "Time range",
  "allStatuses": "All statuses",
  "allTypes": "All types",
  "range24h": "Past 24 hours",
  "range7d": "Past 7 days",
  "range30d": "Past 30 days",
  "rangeAll": "All time",
  "emptyTitle": "No tasks yet",
  "emptyDescription": "Background tasks will appear here once the system starts processing work.",
  "filteredEmptyTitle": "No tasks match the current filters",
  "filteredEmptyDescription": "Try clearing one or more filters.",
  "resetFilters": "Reset filters",
  "nextPage": "Load older tasks",
  "details": "Details",
  "hideDetails": "Hide details"
}
```

Then update `src/app/[locale]/(protected)/admin/layout.tsx`:

```ts
navItems={[
  { href: "/admin", label: t("overview") },
  { href: "/admin/users", label: t("users") },
  { href: "/admin/tasks", label: t("tasks") },
]}
```

- [ ] **Step 4: Create the server page and pass translated labels into the admin task UI**

Create `src/app/[locale]/(protected)/admin/tasks/page.tsx` following the `users/page.tsx` pattern.

Normalize `searchParams` before calling the query so array values collapse to one string:

```ts
function readSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const result = await listAdminTasks({
  status: readSearchParam(raw.status),
  type: readSearchParam(raw.type),
  range: readSearchParam(raw.range),
  cursor: readSearchParam(raw.cursor),
  limit: readSearchParam(raw.limit),
});
```

The page should gather `locale` + `AdminTasks` translations and pass them as a plain `labels` object into the UI component(s), matching the existing `AdminUsersList` pattern instead of baking `useTranslations` into the table itself.

- [ ] **Step 5: Re-run the shell and route tests**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminShell.test.tsx tests/unit/app/admin-route-composition.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add 'src/app/[locale]/(protected)/admin/layout.tsx' \
  'src/app/[locale]/(protected)/admin/tasks/page.tsx' \
  src/modules/admin/ui/index.ts \
  messages/en.json \
  messages/zh.json \
  tests/unit/modules/admin/ui/AdminShell.test.tsx \
  tests/unit/app/admin-route-composition.test.tsx
git commit -m "feat: wire admin tasks route and navigation"
```

### Task 3: Build The Read-Only Filters, Status Badge, And Expandable Task List

**Files:**
- Create: `src/modules/admin/ui/AdminTaskStatusBadge.tsx`
- Create: `src/modules/admin/ui/AdminTaskFilters.tsx`
- Create: `src/modules/admin/ui/AdminTasksList.tsx`
- Modify: `src/modules/admin/ui/index.ts`
- Create: `tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx`
- Create: `tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
- Reference: `src/modules/admin/ui/AdminUsersList.tsx`
- Reference: `src/components/ui/badge.tsx`
- Reference: `src/components/ui/select.tsx`
- Reference: `src/components/LanguageSwitcher.tsx`

- [ ] **Step 1: Write the failing UI tests for empty states, expansion, and URL-driven filters**

Create `tests/unit/modules/admin/ui/AdminTasksList.test.tsx`.

Cover at least:

- empty state when `hasAnyTasks === false`
- filtered-empty state when `hasAnyTasks === true` and `items.length === 0`
- row rendering for a failed task
- clicking the details toggle shows full error text and timestamps
- next-page link includes the existing filter params plus the new cursor

Create `tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx`.

Mock `useRouter`, `usePathname`, and `useSearchParams` so you can assert URL writes. Mock the Radix select wrappers the same way `tests/unit/modules/source-document/ui/QuickEntryForm.test.tsx` does.

Example filter test:

```ts
it("replaces the URL and clears cursor when the status filter changes", async () => {
  render(
    <AdminTaskFilters
      availableTypes={["parse_source_document"]}
      filters={{ status: undefined, type: undefined, range: "all" }}
      labels={labels}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "All statuses" }));
  fireEvent.click(screen.getByText("Failed"));

  expect(routerReplaceMock).toHaveBeenCalledWith(
    "/admin/tasks?status=failed",
    { scroll: false }
  );
});
```

- [ ] **Step 2: Run the new UI tests to verify they fail**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
Expected: FAIL because the admin task UI components do not exist yet.

- [ ] **Step 3: Implement the status badge primitive using the existing shared `Badge` component**

Create `src/modules/admin/ui/AdminTaskStatusBadge.tsx`.

Keep the mapping local and explicit:

```ts
const variantByStatus = {
  failed: "error",
  running: "info",
  pending: "warning",
  completed: "default",
  cancelled: "outline",
} as const;

return (
  <Badge variant={variantByStatus[status]} size="sm">
    {labelByStatus[status]}
  </Badge>
);
```

Do **not** create a new color system or a custom badge implementation.

- [ ] **Step 4: Implement the URL-driven filter bar**

Create `src/modules/admin/ui/AdminTaskFilters.tsx` as a client component.

Use `useRouter` + `usePathname` from `@/i18n/routing` and `useSearchParams` from `next/navigation`, following the URL-preserving style already used in `LanguageSwitcher`.

Implementation rules:

- changing any filter must clear `cursor`
- preserve `limit` if it exists in the URL
- `Reset filters` should clear `status`, `type`, `range`, and `cursor`
- keep the UI to bordered, low-chrome controls aligned with `UI.md`

A minimal update helper should look like:

```ts
function replaceFilters(patch: Record<string, string | null>) {
  const params = new URLSearchParams(searchParams.toString());

  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  params.delete("cursor");
  const query = params.toString();
  router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
}
```

- [ ] **Step 5: Implement the bordered task table with inline detail expansion**

Create `src/modules/admin/ui/AdminTasksList.tsx` as a client component.

Requirements:

- render a `surface` card matching the current admin user table style
- use one expandable state per task id (a single `expandedTaskId` is enough)
- render rows newest first using the already-sorted query result
- show `scopeUserEmail ?? scopeId ?? "—"`
- show a short truncated error summary in the failed row summary
- show full details in a dedicated expanded `<tr>` with `colSpan={6}`
- compute the next-page link by preserving current filters and writing `cursor=nextCursor`

Inline detail row sketch:

```tsx
{expandedTaskId === item.id ? (
  <tr>
    <td colSpan={6} className="border-t border-border bg-surface2 px-6 py-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Task ID</dt>
          <dd className="text-sm text-text break-all">{item.id}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Error</dt>
          <dd className="text-sm text-text whitespace-pre-wrap break-words">{item.error ?? "—"}</dd>
        </div>
      </dl>
    </td>
  </tr>
) : null}
```

Do **not** switch to cards, charts, drawers, or a separate detail route in this batch.

- [ ] **Step 6: Re-run the UI tests**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/ui/AdminTaskStatusBadge.tsx \
  src/modules/admin/ui/AdminTaskFilters.tsx \
  src/modules/admin/ui/AdminTasksList.tsx \
  src/modules/admin/ui/index.ts \
  tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx \
  tests/unit/modules/admin/ui/AdminTasksList.test.tsx
git commit -m "feat: add admin task filters and list ui"
```

### Task 4: Run The Targeted Regressions And Ship The Feature

**Files:**
- Modify: `src/app/[locale]/(protected)/admin/tasks/page.tsx`
- Modify: `src/modules/admin/ui/AdminTasksList.tsx`
- Modify: `src/modules/admin/ui/AdminTaskFilters.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Test: `tests/unit/modules/admin/list-admin-tasks.test.ts`
- Test: `tests/unit/modules/admin/ui/AdminShell.test.tsx`
- Test: `tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx`
- Test: `tests/unit/modules/admin/ui/AdminTasksList.test.tsx`
- Test: `tests/unit/app/admin-route-composition.test.tsx`

- [ ] **Step 1: Manually verify the final UI against the spec before broad verification**

Check the rendered implementation against `docs/superpowers/specs/2026-03-25-admin-tasks-page-design.md` and `docs/architecture/UI.md`.

Confirm these specific constraints in code review before running the full checks:

- no mutation buttons exist
- no dashboard KPI wall was added
- the page still uses bordered surface sections
- failed is the strongest status emphasis, but the page is not a rainbow board
- filters are URL-driven and reset cursor on change

- [ ] **Step 2: Run the full targeted unit suite for the feature**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/admin/list-admin-tasks.test.ts \
  tests/unit/modules/admin/ui/AdminShell.test.tsx \
  tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx \
  tests/unit/modules/admin/ui/AdminTasksList.test.tsx \
  tests/unit/app/admin-route-composition.test.tsx
```

Expected: PASS

- [ ] **Step 3: Run lint on the touched admin files**

Run:

```bash
npm run lint -- \
  'src/app/[locale]/(protected)/admin/layout.tsx' \
  'src/app/[locale]/(protected)/admin/tasks/page.tsx' \
  src/modules/admin
```

Expected: PASS with no new lint violations.

- [ ] **Step 4: Run TypeScript verification**

Run: `npm run tsc`
Expected: PASS

- [ ] **Step 5: Commit the finished feature**

```bash
git add 'src/app/[locale]/(protected)/admin/layout.tsx' \
  'src/app/[locale]/(protected)/admin/tasks/page.tsx' \
  src/modules/admin \
  messages/en.json \
  messages/zh.json \
  tests/unit/modules/admin/list-admin-tasks.test.ts \
  tests/unit/modules/admin/ui/AdminShell.test.tsx \
  tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx \
  tests/unit/modules/admin/ui/AdminTasksList.test.tsx \
  tests/unit/app/admin-route-composition.test.tsx
git commit -m "feat: add read-only admin tasks page"
```
