# Admin System Config Page Design

## Goal

Add a read-only admin system configuration page to Cashier so super admins can inspect the configuration values the running system is actually using.

The first release should provide:

- a new `/admin/system-config` page inside the existing admin backend
- a navigation entry alongside Overview, Users, and Tasks
- a read-only list of system-owned configuration items
- visibility into each config item's currently effective value
- visibility into whether the value comes from an explicit environment override or from the system default

This release is for operational visibility and future configuration-management groundwork, not live editing.

## Product Intent

The user does not want a page that mirrors `.env` files or blindly dumps `process.env`.

The intended admin surface is a system configuration center:

- the system owns a stable configuration catalog
- deployment environment variables may override catalog-defined settings
- when an override is absent, the system falls back to the catalog default when one exists
- the admin page should show the values the system is actually using now

This means the admin page must be driven by the repository's configuration model rather than by the presence or contents of `.env`, `.env.local`, or `.env.example` files at runtime.

## Existing Repository Context

The repository already has the core configuration foundation needed for this feature:

- `src/lib/env/catalog.ts`
  - defines the application-owned configuration catalog
  - includes `tier`, `required`, `defaultValue`, `description`, and startup-validation metadata
- `src/lib/env/startup.ts`
  - defines parsing, defaulting, and validation behavior for startup-backed config values
- `src/lib/env/runtime.ts`
  - exposes the effective runtime-facing values consumed by the server

The repository also already has a stable admin backend pattern:

- admin navigation is configured in `src/app/[locale]/(protected)/admin/layout.tsx`
- admin pages are server-rendered route files that fetch data and translations, then pass labels and data into admin UI components
- admin queries live under `src/modules/admin/application/queries/`
- admin DTOs live in `src/modules/admin/contracts.ts`
- admin UI list components live in `src/modules/admin/ui/`

The new system config page should follow those established patterns rather than introducing a separate architecture.

## Confirmed Scope

### In Scope

- add `/admin/system-config`
- add an admin navigation entry for System Config
- display configuration items from the application-owned env catalog
- show only `system` and `runtime` tier config entries in this first release
- show the currently effective value for each displayed entry
- show whether each value comes from an explicit environment override, a catalog default, or is currently missing
- keep the page read-only
- preserve `super_admin` access control through the existing admin backend gate
- shape the data model so the page can evolve later into an editable config surface

### Out of Scope

- editing config values from the admin UI
- saving config values back to `.env`, `.env.local`, or any other file
- hot-reloading or revalidating app config from the page
- restart orchestration
- per-field validation UX in the page
- mutation toasts, confirmation dialogs, or optimistic updates
- showing arbitrary framework/process environment variables outside the application catalog
- showing `frontend` tier config entries in this first release
- secret masking in this first release

## Core Decisions

### 1. The page is driven by the app env catalog, not by `.env` files

The system config page should treat `src/lib/env/catalog.ts` as the authoritative list of configuration entries to show.

`.env.example` remains useful documentation, but it is not the runtime source of truth. This matters because the user explicitly wants the page to represent the system's own maintained config list even if deployment files drift, are incomplete, or are deleted.

### 2. The page shows effective values, not raw file contents

Each row should show the value the system would actually use under the current process environment.

For each catalog entry:

- if `process.env[name]` is present and non-blank, use that value and mark the source as `environment`
- otherwise, if the catalog entry has a `defaultValue`, use that and mark the source as `default`
- otherwise, show no value and mark the source as `missing`

This matches the product intent: the page answers "what is the system using right now?" rather than "what text happens to be in a file?"

### 3. The first release is read-only but should be shaped for future editing

The user already intends to make this area editable later, but not now.

That means the first release should avoid a dead-end design. The query output and UI structure should be close to an eventual editable config model, even though the page currently renders only read-only fields.

Examples of future-facing concepts that the current design should leave room for:

- editable vs non-editable entries
- current value source expanding beyond `environment` / `default` / `missing`
- restart requirements
- validation summaries

These do not need to be implemented yet.

### 4. `frontend` tier config stays out of scope for v1

The env catalog currently includes `system`, `runtime`, and `frontend` tiers.

The first release should display only `system` and `runtime` entries. `frontend` entries such as `NEXT_PUBLIC_*` are public-bundle configuration and are intentionally excluded for now to keep the page aligned with the user's immediate admin-system goal.

### 5. The page should follow the existing admin module shape exactly

This feature should use the same route/query/UI split already used by the admin users and admin tasks pages:

- route file loads translations and data
- admin query builds a read-only DTO list
- UI component renders the list
- admin layout owns navigation

This keeps the admin backend predictable and avoids introducing a one-off implementation style.

## Information Architecture

### Route

- `/admin/system-config`

### Navigation

The admin shell navigation should gain a `System Config` entry in `src/app/[locale]/(protected)/admin/layout.tsx`.

The resulting nav set becomes:

- `/admin`
- `/admin/users`
- `/admin/tasks`
- `/admin/system-config`

### Page responsibility

The page should provide an operational, read-only view of application-owned configuration.

It is not responsible for:

- editing values
- validating a hypothetical future submission
- explaining deployment state beyond value source
- inspecting host-level environment outside the app catalog

## Data Design

### Source catalog

The displayed config list should come from `APP_ENV_CATALOG` in `src/lib/env/catalog.ts`.

The query should filter the catalog to only:

- `tier === "system"`
- `tier === "runtime"`

and preserve the catalog order rather than re-sorting alphabetically. Keeping catalog order makes the admin page align with the system's own config organization.

### Row DTO

A dedicated admin DTO should be added to `src/modules/admin/contracts.ts`.

Recommended shape:

```ts
export type AdminSystemConfigSource = "environment" | "default" | "missing";

export interface AdminSystemConfigItem {
  name: string;
  tier: "system" | "runtime";
  required: boolean;
  description: string;
  value: string | null;
  source: AdminSystemConfigSource;
}
```

A wrapper result type is optional. A plain `AdminSystemConfigItem[]` return is acceptable if no pagination, filters, or summary metadata are needed in v1.

### Effective value resolution

The query should compute the display value without parsing env files directly.

Resolution rules:

1. Read `process.env[name]`
2. If the value exists and `trim() !== ""`, return it as:
   - `value = process.env[name]`
   - `source = "environment"`
3. Otherwise, if `defaultValue != null`, return:
   - `value = defaultValue`
   - `source = "default"`
4. Otherwise, return:
   - `value = null`
   - `source = "missing"`

This rule intentionally mirrors the repository's current fallback philosophy in `startup.ts` without making the UI depend on `.env` file parsing.

### Why not read from `runtimeEnv`

`runtimeEnv` exposes normalized getters for application consumption, but this page needs to show every catalog-backed entry in a uniform way and distinguish the value source per key.

A dedicated admin query over `APP_ENV_CATALOG` plus `process.env` is therefore a better fit than trying to reverse-map everything from the runtime facade.

## Route, Query, and UI Structure

### Route file

Add:

- `src/app/[locale]/(protected)/admin/system-config/page.tsx`

Responsibilities:

- load `locale` and `AdminSystemConfig` translations
- call the new admin query
- pass localized labels and data into the UI component

This should follow the style already used by:

- `src/app/[locale]/(protected)/admin/users/page.tsx`
- `src/app/[locale]/(protected)/admin/tasks/page.tsx`

### Query file

Add:

- `src/modules/admin/application/queries/list-admin-system-config.ts`

Responsibilities:

- call `requireSuperAdmin()`
- iterate the filtered env catalog entries
- compute `value` and `source` for each row
- return read-only admin DTOs

This keeps env-resolution logic out of page files and UI components.

### Query barrel

Update:

- `src/modules/admin/queries.ts`

to export the new `listAdminSystemConfig` query.

### UI component

Add:

- `src/modules/admin/ui/AdminSystemConfigList.tsx`

Responsibilities:

- render the read-only list/table
- format only presentation concerns
- receive all values precomputed from the query layer

The component should be exported from `src/modules/admin/ui/index.ts` the same way existing admin UI building blocks are exported.

## UI and Interaction Design

### Overall page presentation

The page should match the visual conventions already used by `AdminUsersList` and `AdminTasksList`:

- a rounded bordered section with a header area
- a title and short description
- a table-based read-only listing

This page should not introduce a separate dashboard visual style.

### Read-only notice

The page should clearly state that the current release is view-only and does not support modifications yet.

This can be expressed in the page description or as a small informational note above the table. It does not need a special banner component unless an existing admin pattern requires one.

### Table columns

Recommended columns for v1:

- Name
- Tier
- Source
- Required
- Value
- Description

Rationale:

- unlike the tasks page, this page does not need row expansion for the first release
- the value itself is the primary object of interest, so it should be visible directly in the table
- description helps admins understand the purpose of each config item without having to cross-reference code

### Value rendering

Because the user explicitly approved full-value display for this first release, values should be rendered plainly.

However, the implementation should still isolate value rendering inside the list component in a way that would allow later extension for:

- secret masking
- copy-to-clipboard controls
- inline editing controls

No such affordances need to be added in v1.

### Empty state

The page is not expected to be empty because the env catalog is application-owned and non-empty.

Still, the UI component should support a fallback empty state similar to other admin pages in case the filtered catalog becomes empty unexpectedly.

## Translation Design

Following the existing admin page pattern, translations should be introduced for:

- admin nav label: `Admin.systemConfig`
- page-level labels under a dedicated namespace such as `AdminSystemConfig`

Expected labels include at least:

- title
- description
- readOnlyNotice
- name
- tier
- source
- required
- value
- descriptionColumn
- emptyTitle
- emptyDescription
- tierSystem
- tierRuntime
- sourceEnvironment
- sourceDefault
- sourceMissing
- requiredYes
- requiredNo
- notSet

The exact keys may vary, but they should follow the repository's current translation organization used by `AdminUsers` and `AdminTasks`.

## Testing Strategy

The main risks are query correctness and admin integration consistency.

### 1. Query contract tests

Tests should verify that the new admin system config query:

- requires super admin access
- includes only `system` and `runtime` tier entries
- preserves catalog order
- marks explicit non-blank env values as `environment`
- falls back to catalog defaults as `default`
- marks entries with neither env value nor default as `missing`

At least one test should cover the blank-string case so an env value of `""` does not incorrectly count as an explicit override.

### 2. Page integration tests

Tests should verify that:

- the admin layout includes the new System Config nav link
- `/admin/system-config` renders the list component with translated labels
- the page shows the read-only messaging

### 3. UI rendering tests

Tests should verify that the list component:

- renders rows with the expected columns
- renders `missing` values cleanly
- handles long values and descriptions without collapsing structure
- renders the empty state if given an empty list

No mutation tests are needed because the page is read-only.

## Acceptance Criteria

- The admin backend navigation includes a `System Config` entry
- `/admin/system-config` is available only inside the existing super-admin-protected admin backend
- The page displays application-owned config entries from the env catalog rather than parsing `.env` files directly
- The first release shows only `system` and `runtime` tier entries
- Each row shows the effective current value being used by the system
- Each row shows whether the value comes from an explicit environment override, a catalog default, or is currently missing
- The page is read-only and clearly communicates that editing is not yet supported
- The implementation follows the repository's existing admin route/query/UI structure
- Tests cover source resolution, tier filtering, and admin integration

## Implementation Notes for Planning

The cleanest v1 implementation path is:

1. add the admin DTO and query
2. add the new route file and UI list component
3. wire the nav item and translations
4. add tests for query behavior and page/UI rendering

The design intentionally avoids speculative editing behavior while still establishing the admin system configuration page as the future home for configuration management.
