# Admin Task Full Record Visibility Design

## Goal

Extend the existing read-only admin tasks page so a super admin can inspect the full stored `task_runs` record for any task, not just the current summary fields.

This follow-up should preserve the current value of `/admin/tasks` as a readable task index while upgrading the detail experience into a complete record viewer.

## Product Intent

The current `/admin/tasks` page already solves the first operational visibility problem:

- what ran recently
- what failed
- what is currently running
- which task type is involved

The next need is more literal and lower-level: when an admin opens task details, they should be able to inspect the actual `task_runs` row comprehensively, including raw fields such as `input` and `tokenUsage`.

This is still a read-only admin capability. It is not task control, and it is not an observability platform. The goal is to make `/admin/tasks` a trustworthy internal viewer for backend task records.

## Confirmed Scope

### In Scope

- keep `/admin/tasks` as the existing entry point
- preserve the current list-first page structure
- upgrade task details so all `task_runs` fields can be viewed
- show raw JSON-like fields in readable formatted blocks
- continue to show current derived helper data such as `scopeUserEmail` and `duration`
- keep the page aligned with the existing admin shell and [`docs/architecture/UI.md`](/home/dev/workspace/Cashier/docs/architecture/UI.md)

### Out of Scope

- task mutations of any kind
- a new `/admin/tasks/[id]` route
- modal or drawer-based detail UI
- copy/download/export actions for raw task data
- field-level search inside the detail panel
- inline editing of task data
- audit-log redesign or security monitoring work

## Relationship To The Existing Admin Tasks Page

This design is a follow-up to [`2026-03-25-admin-tasks-page-design.md`](/home/dev/workspace/Cashier/docs/superpowers/specs/2026-03-25-admin-tasks-page-design.md).

That earlier design established:

- the dedicated `/admin/tasks` route
- newest-first task history
- status/type/range filters
- cursor pagination
- lightweight row-level details

This follow-up does not replace that structure. It strengthens the details portion so the page can serve as a complete `task_runs` viewer.

### Existing page states remain unchanged

This follow-up inherits the existing `/admin/tasks` page-state behavior established by the prior design. The following behaviors are unchanged and must not regress:

- the no-data empty state
- the filtered no-results state
- the standard admin error presentation when the page fails to load

## Core Decisions

### 1. “All fields” means literal `task_runs` field coverage

The admin detail experience should expose the full stored `task_runs` record, not only the currently summarized subset.

The intended raw-field set is:

- `id`
- `type`
- `title`
- `input`
- `deduplicationKey`
- `scopeId`
- `entityType`
- `entityId`
- `status`
- `error`
- `progress`
- `tokenUsage`
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`
- `deletedAt`

If the database schema changes before this follow-up ships, any newly added `task_runs` column must either:

- be surfaced in the detail viewer in the same batch, or
- be explicitly deferred by updating this spec in that same batch

No current or newly introduced `task_runs` column may be silently omitted.

### 2. The list remains concise; the full record lives in details

The task table should stay optimized for scanning. The new requirement is not a request to turn the table into a wide raw-database grid.

Instead:

- the list continues to show the current summary columns
- the details region becomes the complete-record viewer

This preserves the value of `/admin/tasks` as both an index and an inspector.

### 3. Raw fields and derived helper data must be visually distinguished

The page may continue showing useful derived values such as:

- `scopeUserEmail`
- `duration`

But those are not `task_runs` columns.

The detail UI should make this distinction legible, so the admin can tell which values come from the underlying row and which are computed for convenience.

### 4. JSON-like fields deserve a dedicated presentation

`input` and `tokenUsage` should not be rendered as flat inline text fields.

They should appear in formatted read-only blocks that:

- preserve structure
- support long content safely
- do not destroy the readability of the surrounding detail panel

### 5. Raw data should be available without dominating the page

The admin asked for all fields to be viewable, but that does not mean every raw payload must be visually expanded by default.

The design should therefore keep the heavy raw-data group available while allowing it to be collapsed by default. This preserves complete visibility without overwhelming the task page.

## Information Architecture

### Route

- `/admin/tasks`

No additional route is required for this follow-up.

### Page responsibility

`/admin/tasks` continues to act as:

1. a filterable task-history index
2. a read-only viewer for an individual task record

It should not become:

- a workflow tool
- a data editing surface
- a log-analysis dashboard

## Data Design

### Query contract expansion

The existing `/admin/tasks` list contract should remain payload-bounded and scan-oriented. This follow-up does **not** require the initial 50-row list response to preload full raw payloads for every visible task.

Instead, implementation should preserve the current summary-oriented list contract for the table and add a detail-specific data contract for the expanded record view, or an equivalent lazy/bounded mechanism with the same effect.

Whatever mechanism is chosen, opening task details must provide the full raw field set required for the detail panel, including the fields currently omitted from the admin task DTO:

- `input`
- `deduplicationKey`
- `tokenUsage`
- `updatedAt`
- `deletedAt`

The list path must continue to enforce admin access first and preserve the current cursor, filter, and enrichment behavior. The detail path must remain read-only.

### JSON-like field handling

For the purpose of the UI contract:

- `input` should be delivered in a form that can be rendered as formatted JSON or a serialized raw block
- `tokenUsage` should be delivered in a form that can be rendered the same way

If either field is absent, `null`, or empty, the UI should show that state clearly rather than fabricating content.

### Derived helper fields

The UI may continue to receive derived helper fields alongside the raw row data, including:

- `scopeUserEmail`
- `duration`

Those helper values are allowed because they improve operational reading, but they are secondary to raw row visibility.

## Detail Panel Design

### Overall behavior

The existing `Details` interaction should remain the entry point.

When expanded, the detail region should become a structured full-record panel rather than a short summary.

### Field grouping

The detail panel should group content into five sections.

#### 1. Task basics

- `id`
- `type`
- `title`
- `status`

#### 2. Scope and entity

- `scopeId`
- `entityType`
- `entityId`
- `deduplicationKey`
- `scopeUserEmail` (derived helper)

#### 3. Timing

- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`
- `deletedAt`
- `duration` (derived helper)

#### 4. Execution

- `progress`
- `error`

#### 5. Raw data

- `input`
- `tokenUsage`

### Default expansion behavior

The recommended default is:

- task basics: expanded
- scope and entity: expanded
- timing: expanded
- execution: expanded
- raw data: collapsed by default

This keeps the page readable while still honoring the requirement that all fields be viewable.

### Null and empty-value rules

For ordinary scalar fields:

- missing / empty / null values should render as `—`

For raw JSON-like fields:

- a literal `null` value should render as `null`
- an absent field should render as `—` rather than disappearing
- an empty string should render as `""`
- an empty object should render as `{}`
- an empty array should render as `[]`
- if a field contains a non-JSON raw string, it should render exactly as stored rather than being reformatted into a fake object

### Raw data rendering

`input` and `tokenUsage` should render in formatted read-only blocks.

Expected behavior:

- pretty-printed formatting where structured data is available
- long content wraps safely or scrolls inside the block
- content remains selectable and readable
- raw blocks do not force the list layout to become excessively tall when collapsed

## UI and Interaction Behavior

The page must remain visually aligned with the current admin area and [`docs/architecture/UI.md`](/home/dev/workspace/Cashier/docs/architecture/UI.md).

### Preserve the current page character

The admin tasks page should still feel like:

- a bordered internal records page
- a compact operational viewer
- part of the same product family as the admin user list

It should not become:

- a full-screen JSON inspector
- a dashboard wall
- a visually heavy backend console

### Visual rules

- keep the summary table visually dominant as the index
- keep borders and spacing as the main separation tools
- use the existing surface hierarchy (`bg`, `surface`, `surface2`)
- let raw-data blocks look secondary to the summary table, even when expanded

### Raw data blocks

The raw-data group may use a code/preformatted treatment, but it should remain consistent with the system’s restrained visual language.

That means:

- raw data appears only inside the expanded detail area, not as new summary-table columns
- no new visual theme just for JSON
- no bright terminal-like styling
- no excessive shadow or color-heavy panels
- raw blocks stay contained within the existing bordered detail region with safe overflow handling

### Interaction limits

This follow-up should not introduce new interaction patterns beyond what is needed to show the complete record.

In particular, do not add:

- edit affordances
- destructive controls
- bulk selection behavior
- clipboard/export utilities

## Testing Strategy

### 1. Data-contract coverage

Tests should confirm that the detail data path for an opened task returns the newly required raw fields, including:

- `input`
- `deduplicationKey`
- `tokenUsage`
- `updatedAt`
- `deletedAt`

Tests should also continue protecting:

- access control
- filtering
- pagination
- stable ordering

### 2. Detail rendering coverage

UI tests should confirm that:

- all `task_runs` raw fields are present in the expanded detail view
- raw-data fields render in dedicated formatted blocks
- raw-data groups can be collapsed by default while remaining accessible
- scalar null/empty states follow the agreed display rules
- raw JSON-like empty states follow the explicit rules for `null`, absent, empty string, empty object, and empty array
- derived helper fields remain visible under labels that are distinct from raw database column names

### 3. Route composition coverage

Page-composition tests should confirm that `/admin/tasks` still wires the required task payloads into the list/detail UI without regressing filters, pagination, or the existing no-data / filtered-empty / error-state behavior.

## Acceptance Criteria

- `/admin/tasks` still behaves as the task index page
- the summary table remains the primary index surface; no new task-detail route, modal, or drawer is introduced in this batch
- opening task details exposes the full `task_runs` record
- the following raw fields are viewable in the details UI:
  - `id`
  - `type`
  - `title`
  - `input`
  - `deduplicationKey`
  - `scopeId`
  - `entityType`
  - `entityId`
  - `status`
  - `error`
  - `progress`
  - `tokenUsage`
  - `createdAt`
  - `updatedAt`
  - `startedAt`
  - `completedAt`
  - `deletedAt`
- raw JSON-like fields render in contained read-only blocks rather than flat inline strings
- the raw-data section is available but collapsed by default
- the list summary columns from the existing `/admin/tasks` design remain unchanged by this follow-up
- the no-data empty state, filtered-empty state, and standard admin load-error handling remain intact
- the page remains read-only
- the expanded detail region continues to use the existing bordered surface hierarchy rather than a new dashboard or terminal-style visual system
- if the `task_runs` schema changes before implementation ships, the same batch must either surface the new column(s) or explicitly update this spec to defer them

## Future Evolution

Natural follow-up work may later include:

- copy-to-clipboard for raw payload blocks
- dedicated task detail routes if the inline panel becomes too dense
- links from task details into related source documents or entities
- richer developer-facing diagnostics for complex task payloads

Those should be designed separately. This batch should stay focused on complete read-only visibility of the stored `task_runs` record.
