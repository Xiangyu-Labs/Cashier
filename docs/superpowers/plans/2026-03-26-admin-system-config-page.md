# Admin System Config Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only `/admin/system-config` page that lets `super_admin` users inspect the application-owned configuration catalog's effective `system` and `runtime` values, including whether each value comes from an environment override, a catalog default, or is currently missing.

**Architecture:** Keep the feature admin-owned end to end. Add a dedicated admin query that reads `APP_ENV_CATALOG`, filters it to `system` and `runtime`, resolves each row against `process.env`, and returns a small admin DTO list; then wire a server page that loads translations and passes labels plus rows into a single table-style admin UI component. Reuse the existing admin shell, contracts barrel, route-composition tests, and message catalog patterns instead of inventing a new config subsystem.

**Tech Stack:** Next.js App Router, TypeScript, next-intl, Tailwind, Vitest, Testing Library

---

## Scope Check

This plan covers one coherent subsystem: a read-only admin system-config page. It does **not** include config editing, persistence back to `.env` files, runtime reloads, masking rules, or frontend-tier config display. Those remain future work.

## File Map

- `src/modules/admin/contracts.ts`
  - Add the admin-owned DTO and source union for system-config rows.
- `src/modules/admin/application/queries/list-admin-system-config.ts`
  - New admin-only query that enforces `requireSuperAdmin`, filters `APP_ENV_CATALOG`, resolves effective values, and returns stable DTOs in catalog order.
- `src/modules/admin/queries.ts`
  - Export the new query.
- `src/modules/admin/ui/AdminSystemConfigList.tsx`
  - New read-only admin table component with the same card/table structure used by other admin lists.
- `src/modules/admin/ui/index.ts`
  - Export the new UI component and label type.
- `src/app/[locale]/(protected)/admin/system-config/page.tsx`
  - New server page that loads `AdminSystemConfig` translations, calls the query, and renders the list.
- `src/app/[locale]/(protected)/admin/layout.tsx`
  - Add the `System Config` navigation entry.
- `messages/en.json`
  - Add `Admin.systemConfig` and the `AdminSystemConfig` namespace.
- `messages/zh.json`
  - Add `Admin.systemConfig` and the `AdminSystemConfig` namespace.
- `tests/unit/modules/admin/list-admin-system-config.test.ts`
  - New query tests for tier filtering, source resolution, and access control.
- `tests/unit/admin/AdminSystemConfigList.test.tsx`
  - New UI rendering tests for columns, missing values, and empty state.
- `tests/unit/app/admin-route-composition.test.tsx`
  - Extend the admin route-composition contract to cover the new nav item and page wiring.

## Non-Goals

- Do not add edit controls, save buttons, or mutation flows.
- Do not parse `.env`, `.env.local`, or `.env.example` files directly.
- Do not include `frontend` tier rows in this batch.
- Do not add copy-to-clipboard, masking, or restart badges in this batch.
- Do not refactor the existing env catalog/startup/runtime modules unless a tiny helper extraction is necessary for clarity.

### Task 1: Lock The Admin System Config Query Contract First

**Files:**
- Modify: `src/modules/admin/contracts.ts`
- Create: `src/modules/admin/application/queries/list-admin-system-config.ts`
- Modify: `src/modules/admin/queries.ts`
- Create: `tests/unit/modules/admin/list-admin-system-config.test.ts`
- Reference: `src/lib/env/catalog.ts`
- Reference: `src/modules/admin/application/queries/list-admin-users.ts`
- Reference: `tests/unit/modules/admin/list-admin-users.test.ts`

- [ ] **Step 1: Write the failing query tests for access control, tier filtering, and source resolution**

Create `tests/unit/modules/admin/list-admin-system-config.test.ts` with a mocked `requireSuperAdmin`. Mock `@/lib/env/catalog` so the test controls the catalog rows directly and avoids coupling to unrelated catalog changes.

Start with a contract like this:

```ts
import { describe, expect, it, vi } from "vitest";
import { listAdminSystemConfig } from "@/modules/admin/queries";

const { requireSuperAdminMock, envCatalogMock } = vi.hoisted(() => ({
  requireSuperAdminMock: vi.fn(),
  envCatalogMock: [
    {
      name: "DATABASE_URL",
      tier: "system",
      required: false,
      defaultValue: "file:./data/sqlite.db",
      description: "SQLite database connection string.",
      validateOnStartup: true,
    },
    {
      name: "AI_MODEL_TEXT",
      tier: "runtime",
      required: false,
      defaultValue: "gpt-4o-mini",
      description: "Default text model.",
      validateOnStartup: true,
    },
    {
      name: "AUTH_SECRET",
      tier: "system",
      required: true,
      defaultValue: null,
      description: "Auth secret.",
      validateOnStartup: true,
    },
    {
      name: "NEXT_PUBLIC_APP_URL",
      tier: "frontend",
      required: false,
      defaultValue: "http://localhost:3000",
      description: "Public app URL.",
      validateOnStartup: true,
    },
  ],
}));
```

Add these tests:

- `requires super-admin access before listing config`
- `returns only system and runtime rows in catalog order`
- `uses environment as the source when a non-blank env value is present`
- `falls back to default when env is blank or missing`
- `marks rows without env and without default as missing`

Use a per-test env object instead of mutating global `process.env` when possible:

```ts
const result = await listAdminSystemConfig({
  DATABASE_URL: "file:./data/prod.db",
  AI_MODEL_TEXT: "",
} as NodeJS.ProcessEnv);

expect(result).toEqual([
  expect.objectContaining({
    name: "DATABASE_URL",
    value: "file:./data/prod.db",
    source: "environment",
  }),
  expect.objectContaining({
    name: "AI_MODEL_TEXT",
    value: "gpt-4o-mini",
    source: "default",
  }),
  expect.objectContaining({
    name: "AUTH_SECRET",
    value: null,
    source: "missing",
  }),
]);
```

- [ ] **Step 2: Run the new query test to verify it fails**

Run: `npm run test:unit -- tests/unit/modules/admin/list-admin-system-config.test.ts`
Expected: FAIL because the query, DTO, and export do not exist yet.

- [ ] **Step 3: Add the admin-owned DTOs to `contracts.ts`**

Extend `src/modules/admin/contracts.ts` with a minimal config contract:

```ts
export type AdminSystemConfigTier = "system" | "runtime";
export type AdminSystemConfigSource = "environment" | "default" | "missing";

export interface AdminSystemConfigItem {
  name: string;
  tier: AdminSystemConfigTier;
  required: boolean;
  description: string;
  value: string | null;
  source: AdminSystemConfigSource;
}
```

Keep this contract small. Do not add future-facing fields like `editable`, `masked`, or `restartRequired` in this batch.

- [ ] **Step 4: Implement the admin query with an injectable env object**

Create `src/modules/admin/application/queries/list-admin-system-config.ts`.

Implementation rules:

- call `await requireSuperAdmin()` first
- accept an optional env parameter strictly for testability:

```ts
export async function listAdminSystemConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<AdminSystemConfigItem[]> {
```

- iterate `APP_ENV_CATALOG`
- skip rows where `tier === "frontend"`
- preserve catalog order
- resolve source/value using:

```ts
function resolveConfigValue(
  rawValue: string | undefined,
  defaultValue: string | null
): { value: string | null; source: AdminSystemConfigSource } {
  if (rawValue != null && rawValue.trim() !== "") {
    return { value: rawValue, source: "environment" };
  }

  if (defaultValue != null) {
    return { value: defaultValue, source: "default" };
  }

  return { value: null, source: "missing" };
}
```

- return DTO rows like:

```ts
return APP_ENV_CATALOG.flatMap((entry) => {
  if (entry.tier === "frontend") {
    return [];
  }

  const { value, source } = resolveConfigValue(env[entry.name], entry.defaultValue);

  return [{
    name: entry.name,
    tier: entry.tier,
    required: entry.required,
    description: entry.description,
    value,
    source,
  } satisfies AdminSystemConfigItem];
});
```

Update `src/modules/admin/queries.ts` to export `listAdminSystemConfig`.

- [ ] **Step 5: Re-run the query tests**

Run: `npm run test:unit -- tests/unit/modules/admin/list-admin-system-config.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit the query contract slice**

```bash
git add src/modules/admin/contracts.ts \
  src/modules/admin/application/queries/list-admin-system-config.ts \
  src/modules/admin/queries.ts \
  tests/unit/modules/admin/list-admin-system-config.test.ts
git commit -m "feat: add admin system config query"
```

### Task 2: Add The Read-Only Admin System Config UI

**Files:**
- Create: `src/modules/admin/ui/AdminSystemConfigList.tsx`
- Modify: `src/modules/admin/ui/index.ts`
- Create: `tests/unit/admin/AdminSystemConfigList.test.tsx`
- Reference: `src/modules/admin/ui/AdminUsersList.tsx`
- Reference: `src/modules/admin/ui/AdminTasksList.tsx`

- [ ] **Step 1: Write the failing UI tests for table columns, missing values, and empty state**

Create `tests/unit/admin/AdminSystemConfigList.test.tsx` in the same style as `AdminUsersList.test.tsx` and `AdminTasksList.test.tsx`.

Use labels like:

```ts
const labels = {
  title: "System Config",
  description: "Read-only visibility into effective config values.",
  readOnlyNotice: "Read-only for now.",
  name: "Name",
  tier: "Tier",
  source: "Source",
  required: "Required",
  value: "Value",
  descriptionColumn: "Description",
  emptyTitle: "No config rows",
  emptyDescription: "No config rows are currently available.",
  tierSystem: "System",
  tierRuntime: "Runtime",
  sourceEnvironment: "Environment",
  sourceDefault: "Default",
  sourceMissing: "Missing",
  requiredYes: "Yes",
  requiredNo: "No",
  notSet: "Not set",
};
```

Add tests that verify:

- all six column headers render
- a `missing` row renders `Not set`
- a `required: true` row renders `Yes`
- the read-only notice is visible
- empty `items` renders the empty state instead of a table

- [ ] **Step 2: Run the UI tests to verify they fail**

Run: `npm run test:unit -- tests/unit/admin/AdminSystemConfigList.test.tsx`
Expected: FAIL because the UI component and export do not exist yet.

- [ ] **Step 3: Implement `AdminSystemConfigList.tsx` using the existing admin card/table pattern**

Create `src/modules/admin/ui/AdminSystemConfigList.tsx` as a small client component.

Implementation outline:

```tsx
"use client";

import type { AdminSystemConfigItem } from "@/modules/admin/contracts";

export interface AdminSystemConfigListLabels {
  title: string;
  description: string;
  readOnlyNotice: string;
  name: string;
  tier: string;
  source: string;
  required: string;
  value: string;
  descriptionColumn: string;
  emptyTitle: string;
  emptyDescription: string;
  tierSystem: string;
  tierRuntime: string;
  sourceEnvironment: string;
  sourceDefault: string;
  sourceMissing: string;
  requiredYes: string;
  requiredNo: string;
  notSet: string;
}
```

Rendering rules:

- copy the same outer section structure used by `AdminUsersList`
- use a plain table, not expandable rows
- map tier/source/required through small formatter helpers
- render missing values as `labels.notSet`
- render `value` and `description` cells with `break-all` so long strings wrap instead of breaking layout

Suggested body cell expressions:

```tsx
<td className="break-all px-6 py-4 text-sm text-text">{item.value ?? labels.notSet}</td>
<td className="break-all px-6 py-4 text-sm text-muted">{item.description}</td>
```

- [ ] **Step 4: Export the component from the admin UI barrel**

Update `src/modules/admin/ui/index.ts`:

```ts
export {
  AdminSystemConfigList,
  type AdminSystemConfigListLabels,
} from "./AdminSystemConfigList";
```

- [ ] **Step 5: Re-run the UI tests**

Run: `npm run test:unit -- tests/unit/admin/AdminSystemConfigList.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit the UI slice**

```bash
git add src/modules/admin/ui/AdminSystemConfigList.tsx \
  src/modules/admin/ui/index.ts \
  tests/unit/admin/AdminSystemConfigList.test.tsx
git commit -m "feat: add admin system config list"
```

### Task 3: Wire The Admin Route, Navigation, And Translations

**Files:**
- Create: `src/app/[locale]/(protected)/admin/system-config/page.tsx`
- Modify: `src/app/[locale]/(protected)/admin/layout.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`
- Modify: `tests/unit/app/admin-route-composition.test.tsx`
- Reference: `src/app/[locale]/(protected)/admin/users/page.tsx`
- Reference: `src/app/[locale]/(protected)/admin/tasks/page.tsx`

- [ ] **Step 1: Extend the route-composition test with the new nav item and page wiring**

Update `tests/unit/app/admin-route-composition.test.tsx` before touching the route files.

Add a new hoisted mock for `listAdminSystemConfig` and include it in the `@/modules/admin/queries` mock.

Add one assertion to the existing layout-focused test flow that the rendered admin shell now contains a `System Config` nav link.

Add a new page wiring test like:

```ts
it("wires the system-config page to the admin query and list component", async () => {
  listAdminSystemConfigMock.mockResolvedValueOnce([
    {
      name: "DATABASE_URL",
      tier: "system",
      required: false,
      description: "SQLite database connection string.",
      value: "file:./data/sqlite.db",
      source: "default",
    },
  ]);

  const Page = (await import("@/app/[locale]/(protected)/admin/system-config/page")).default;
  render(await Page());

  expect(listAdminSystemConfigMock).toHaveBeenCalledWith();
  expect(screen.getByText("DATABASE_URL")).toBeTruthy();
  expect(screen.getByText("AdminSystemConfig.readOnlyNotice")).toBeTruthy();
});
```

- [ ] **Step 2: Run the route-composition test to verify it fails**

Run: `npm run test:unit -- tests/unit/app/admin-route-composition.test.tsx`
Expected: FAIL because the mock export, nav item, translation lookups, and page file do not exist yet.

- [ ] **Step 3: Add the new page route and admin nav entry**

Create `src/app/[locale]/(protected)/admin/system-config/page.tsx` in the same style as `users/page.tsx`:

```tsx
import { getLocale, getTranslations } from "next-intl/server";
import { listAdminSystemConfig } from "@/modules/admin/queries";
import { AdminSystemConfigList } from "@/modules/admin/ui";

export default async function AdminSystemConfigPage() {
  const locale = await getLocale();
  const t = await getTranslations("AdminSystemConfig");
  const items = await listAdminSystemConfig();

  return (
    <AdminSystemConfigList
      locale={locale}
      items={items}
      labels={{
        title: t("title"),
        description: t("description"),
        readOnlyNotice: t("readOnlyNotice"),
        name: t("name"),
        tier: t("tier"),
        source: t("source"),
        required: t("required"),
        value: t("value"),
        descriptionColumn: t("descriptionColumn"),
        emptyTitle: t("emptyTitle"),
        emptyDescription: t("emptyDescription"),
        tierSystem: t("tierSystem"),
        tierRuntime: t("tierRuntime"),
        sourceEnvironment: t("sourceEnvironment"),
        sourceDefault: t("sourceDefault"),
        sourceMissing: t("sourceMissing"),
        requiredYes: t("requiredYes"),
        requiredNo: t("requiredNo"),
        notSet: t("notSet"),
      }}
    />
  );
}
```

Update `src/app/[locale]/(protected)/admin/layout.tsx` nav items:

```ts
{ href: "/admin/system-config", label: t("systemConfig") },
```

- [ ] **Step 4: Add the new translation keys in both message catalogs**

Update `messages/en.json`:

```json
"Admin": {
  "overview": "Overview",
  "users": "Users",
  "tasks": "Tasks",
  "systemConfig": "System Config"
},
"AdminSystemConfig": {
  "title": "System Config",
  "description": "Read-only visibility into the effective configuration values used by the system.",
  "readOnlyNotice": "This page is read-only for now. Editing will come later.",
  "name": "Name",
  "tier": "Tier",
  "source": "Source",
  "required": "Required",
  "value": "Value",
  "descriptionColumn": "Description",
  "emptyTitle": "No config rows",
  "emptyDescription": "No application config rows are currently available.",
  "tierSystem": "System",
  "tierRuntime": "Runtime",
  "sourceEnvironment": "Environment",
  "sourceDefault": "Default",
  "sourceMissing": "Missing",
  "requiredYes": "Yes",
  "requiredNo": "No",
  "notSet": "Not set"
}
```

Add the same keys with natural Chinese phrasing in `messages/zh.json`.

- [ ] **Step 5: Re-run the route-composition and i18n validation tests**

Run: `npm run test:unit -- tests/unit/app/admin-route-composition.test.tsx`
Expected: PASS.

Run: `npm run validate:i18n`
Expected: PASS.

- [ ] **Step 6: Commit the route/i18n slice**

```bash
git add src/app/[locale]/\(protected\)/admin/layout.tsx \
  src/app/[locale]/\(protected\)/admin/system-config/page.tsx \
  messages/en.json \
  messages/zh.json \
  tests/unit/app/admin-route-composition.test.tsx
git commit -m "feat: add admin system config page"
```

### Task 4: Run Focused Verification And Finish Cleanly

**Files:**
- Verify only; no new files expected unless a failing test reveals a real gap.

- [ ] **Step 1: Run the full targeted unit test set for this feature**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/admin/list-admin-system-config.test.ts \
  tests/unit/admin/AdminSystemConfigList.test.tsx \
  tests/unit/app/admin-route-composition.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run static checks that could catch integration mistakes**

Run: `npm run tsc`
Expected: PASS.

Run: `npm run lint -- src/modules/admin src/app/[locale]/\(protected\)/admin tests/unit/admin tests/unit/modules/admin tests/unit/app/admin-route-composition.test.tsx`
Expected: PASS.

- [ ] **Step 3: Inspect the diff for accidental scope creep**

Run: `git diff --stat HEAD~3..HEAD`
Expected: only the admin system-config query, UI, route, messages, and tests touched by this plan.

If unrelated files appear, stop and clean them up before claiming completion.

- [ ] **Step 4: Create the final verification commit if fixes were needed during verification**

If verification required code changes:

```bash
git add <fixed-files>
git commit -m "fix: polish admin system config page"
```

If no fixes were needed, skip this step.

- [ ] **Step 5: Prepare completion notes**

Document for handoff:

- which tests were run
- whether `system` + `runtime` filtering is enforced in the query
- that `frontend` tier remains intentionally excluded
- that values are displayed in full and the page is still read-only

