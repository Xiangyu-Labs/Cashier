# Admin Tasks Page Design

## Goal

Add a dedicated read-only admin tasks page to Cashier so super admins can inspect background task activity without modifying data.

The first release should provide:

- a new `/admin/tasks` page inside the existing admin backend
- newest-first visibility into backend task history
- stable filters for task status, task type, and recent time range
- lightweight row-level task details for investigation

This release is for operational visibility, not task control.

## Product Intent

The current admin backend establishes the management shell and a read-only user list. The next most valuable admin capability is not more user metadata. It is system run-state visibility.

Cashier already depends on background work for AI-assisted parsing and related processing. When something fails, administrators need a clear, deterministic place to inspect what happened. That need is narrower and more concrete than introducing anomaly heuristics, security analytics, or mutation controls.

This page should therefore answer factual questions such as:

- what ran recently
- what is currently running
- what failed recently
- what kind of work is failing
- which ledger or entity a task belongs to

## Confirmed Scope

### In Scope

- add `/admin/tasks`
- add an admin navigation entry for Tasks
- show backend tasks from `task_runs`
- default sort by newest first
- provide read-only filters for:
  - status
  - task type
  - created-time range
- provide cursor-based pagination
- allow row expansion for full read-only task details
- keep admin access restricted to `super_admin`
- align the UI with the existing admin shell and [`docs/architecture/UI.md`](/home/dev/workspace/Cashier/docs/architecture/UI.md)

### Out of Scope

- retrying tasks
- cancelling tasks
- deleting tasks
- dismissing tasks
- source document anomaly review as part of this page
- OTP or login monitoring
- service credential monitoring
- heuristic “backlog is bad” or “user is anomalous” rules
- task detail routes such as `/admin/tasks/[id]`
- charts, KPI dashboards, or observability-style panels
- mutation toasts, confirmation dialogs, or optimistic updates

## Core Decisions

### 1. Admin tasks is a dedicated page, not a dashboard widget

The next admin capability should be a full page at `/admin/tasks`, not a small summary tacked onto `/admin`.

Tasks already form their own operational domain. Giving them a dedicated route keeps the admin backend modular and avoids turning the admin overview into a cluttered dashboard.

### 2. First release remains strictly read-only

This page is intentionally observational.

It may expose detailed task records, but it must not let the admin change task state. That avoids prematurely deciding operational policies such as:

- who is allowed to retry failures
- whether cancellation is safe
- whether completed history may be pruned
- how task actions should be audited

### 3. The page is about `task_runs`, not mixed “task plus anomaly” concepts

The first release should query only `task_runs`.

It should not reuse the ledger-facing task queue behavior that merges source document anomalies into task results. In the product, “task history” and “document anomaly status” are related but different concepts. Mixing them in the admin page would make the first release harder to reason about.

If anomaly review becomes important later, it should be designed as an explicit admin capability rather than being implicitly bundled into the task list.

### 4. Filters must be deterministic and schema-backed

The first release should filter only on values that already exist as stable task fields:

- `status`
- `type`
- `createdAt`

This keeps the page useful without inventing policy-heavy concepts such as “suspicious”, “stuck”, “abnormal user”, or “dangerous backlog”.

### 5. URL state drives the page

Task filters and pagination should live in search params rather than hidden client-only state.

This gives the admin page stable behavior:

- refresh-safe
- linkable
- easy to reason about
- aligned with server-rendered filtering patterns already used in the repository

## Information Architecture

### Route

- `/admin/tasks`

### Navigation

The admin shell navigation should gain a `Tasks` entry alongside the existing admin routes.

### Page responsibility

`/admin/tasks` should present a paginated read-only list of backend task records with focused filters and expandable details.

The page is not responsible for:

- explaining root cause automatically
- deciding whether running tasks are healthy or unhealthy
- providing task operations
- summarizing all backend subsystems in one place

## Data Design

### Primary source

The page should read from `task_runs`.

Relevant displayed fields include:

- `id`
- `status`
- `type`
- `title`
- `progress`
- `error`
- `scopeId`
- `entityType`
- `entityId`
- `createdAt`
- `startedAt`
- `completedAt`

### Display enrichment

Where possible, the admin task query should enrich task rows through read-only joins:

- `task_runs.scopeId -> ledgers.id`
- `ledgers.userId -> users.id`

This allows the UI to show the owning user email for ledger-scoped tasks.

If no related ledger or user can be resolved, the UI should fall back cleanly to raw identifiers rather than hiding the task.

### Query boundary

The admin backend should define its own dedicated task query instead of reusing the workspace task queue query.

Recommended shape:

- admin access guard
- admin input parsing
- task query + mapping into admin-facing DTOs

This keeps admin semantics independent from ledger UI semantics.

## Query and Filter Design

### Default ordering

The list should order by:

- `createdAt desc`
- `id desc`

This guarantees newest-first behavior with stable ordering for equal timestamps.

### Filters

The first release should support:

#### Status

- all
- failed
- running
- pending
- completed
- cancelled

#### Type

- all types
- specific task type values currently present in the system

Type options should be derived from real distinct values instead of hard-coding a fixed frontend list.

#### Time range

- 24h
- 7d
- 30d
- all

Time range filters apply to `createdAt`.

### URL parameters

Recommended search params:

- `status`
- `type`
- `range`
- `cursor`
- `limit`

Example:

```text
/admin/tasks?status=failed&type=parse_source_document&range=7d
```

### Pagination

The list should use cursor pagination rather than numbered pages.

This fits a newest-first operational log better than page numbers because new tasks may continue to appear while the admin is browsing.

The first release should default to 50 rows per page.

## List and Detail Design

### Page layout

Inside the existing admin shell, the page should use two primary sections:

1. filter controls
2. task list

This should look like a focused admin records page, not a dense analytics dashboard.

### Main list columns

The list should show:

- Created At
- Status
- Type
- Title
- Scope
- Entity

### Column behavior

- **Created At**: primary sort signal, shown in localized display format
- **Status**: compact semantic badge
- **Type**: raw task type or lightly formatted label
- **Title**: primary readable description of the task
- **Scope**: prefer resolved user email when available; otherwise show scope identifier
- **Entity**: show `entityType` and a readable identifier fragment

### Row expansion

The first release should not create a dedicated task details route.

Instead, each row should expand inline to reveal full read-only details, such as:

- task id
- full scope id
- entity type
- full entity id
- created time
- started time
- completed time
- derived duration when timestamps allow it
- progress
- full error text

This keeps the experience lightweight while still making failure investigation practical.

## UI and Interaction Behavior

The page must follow the repository’s existing admin/backend visual language and the rules in [`docs/architecture/UI.md`](/home/dev/workspace/Cashier/docs/architecture/UI.md).

### Visual direction

The tasks page should feel like “the task version of the current admin user list”, not like an external observability dashboard.

### Layout rules

- use the existing `AdminShell`
- keep the page to a small number of bordered surface blocks
- prefer whitespace, typography, and borders over visual effects
- avoid adding a third or fourth background layer when two are enough

### Surface hierarchy

- page background: `bg`
- cards and primary containers: `surface`
- subordinate regions such as table header or expanded detail body: `surface2`

### Borders before shadows

- standard page sections should be separated with borders
- heavy shadows are unnecessary
- floating/elevated visual treatment should be avoided for the main task list

### Color usage

Status indication should be semantic but restrained:

- failed: strongest emphasis
- running: visible but calmer than failed
- pending: light warning emphasis
- completed: low-emphasis positive or neutral treatment
- cancelled: muted treatment

The page should not become a rainbow status board.

### Motion

Interaction feedback must remain minimal:

- small hover background shifts
- subtle active feedback
- light expand/collapse motion only if needed
- no dramatic transitions

### Density

The page should be compact enough for operational scanning, but not cramped. It should stay consistent with the project’s current admin and workspace typography rather than shrinking into a dense infra console.

## State Design

### Empty state: no tasks exist

If there are no task records at all, show a clear empty state rather than an empty table.

### Empty state: filters return no results

If tasks exist but the current filter set matches none, show a “no results for current filters” state and provide a clear filter reset action.

### Error state

If task loading fails, use the admin backend’s standard error presentation. Do not expose raw exception details in the main page body.

### Error summary behavior

For failed tasks:

- the list row may show a short truncated error summary
- the expanded row should show the full error message

## Testing Strategy

The main risk in this release is query and admin contract correctness, not visual novelty.

### 1. Admin access and route composition

- only `super_admin` can access `/admin/tasks`
- unauthorized and unauthenticated behavior remains consistent with the existing admin backend
- admin navigation includes the tasks route

### 2. Query contract correctness

- the query requires admin access
- default ordering is newest first with stable tie-breaking
- `status` filtering works
- `type` filtering works
- `range` filtering works
- cursor pagination is stable
- user-email enrichment works when the ledger relation exists
- unresolved relations fall back gracefully to identifiers

### 3. UI state coverage

- normal results render the intended columns
- no-data empty state renders correctly
- no-results-for-filters state renders correctly
- failed tasks show summary + expandable full error behavior
- expanded detail rows render null or missing values safely

## Acceptance Criteria

- admin navigation includes `Tasks`
- `/admin/tasks` is accessible only to `super_admin`
- the page defaults to newest-first task history
- the page filters by status, type, and created-time range
- the page paginates task history with cursor-based navigation
- rows can expand to show full read-only task details
- failed tasks are visually discoverable without turning the page into a dashboard
- empty, filtered-empty, and error states are each distinct and clear
- the page performs no mutations
- the page visually aligns with the current admin area and [`docs/architecture/UI.md`](/home/dev/workspace/Cashier/docs/architecture/UI.md)

## Future Evolution

Natural follow-up work may include:

- task detail routes if inline expansion becomes insufficient
- source document anomaly review as a separate admin module
- cross-links from tasks into user, ledger, or source document admin pages
- admin-safe task actions once policy is explicit
- security and credential observability pages once their scope is explicitly defined

Those should be designed separately rather than inferred from this first read-only tasks page.
