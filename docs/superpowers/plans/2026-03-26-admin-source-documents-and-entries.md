# Admin Source Documents and Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only `/admin/source-documents` and `/admin/entries` pages with admin nav entries, scan-oriented filters/lists, and expandable details that expose all primary-table columns plus small joined helper fields.

**Architecture:** Extend the existing `src/modules/admin` pattern rather than inventing a new backend slice. Each page gets its own admin contracts, Zod input parsing, dedicated list/detail queries, page route, and focused UI components that mirror the current `/admin/tasks` behavior. Details remain expandable inside the list view so every raw table column is visible without turning the main tables into schema dumps.

**Tech Stack:** Next.js App Router, next-intl, Drizzle ORM, SQLite, Zod, Vitest, Testing Library.

---

## File Structure

### Existing files to modify

- Modify: `src/app/[locale]/(protected)/admin/layout.tsx` — add nav items for Source Documents and Entries.
- Modify: `src/modules/admin/contracts.ts` — add admin source-document and entry DTO/filter/result types.
- Modify: `src/modules/admin/contract-schemas.ts` — add Zod schemas for the new list inputs.
- Modify: `src/modules/admin/queries.ts` — export new list/detail queries.
- Modify: `src/modules/admin/ui/index.ts` — export the new admin UI components.
- Modify: `messages/en.json` — add `Admin`, `AdminSourceDocuments`, and `AdminEntries` strings.
- Modify: `messages/zh.json` — add `Admin`, `AdminSourceDocuments`, and `AdminEntries` strings.
- Modify: `tests/unit/app/admin-route-composition.test.tsx` — cover new route composition and nav wiring.
- Modify: `tests/unit/modules/admin/ui/AdminShell.test.tsx` — assert the shell can render the expanded nav set if needed.

### New source-document admin files

- Create: `src/app/[locale]/(protected)/admin/source-documents/page.tsx` — page composition for source-document filters, list query, and optional expanded detail.
- Create: `src/modules/admin/application/queries/list-admin-source-documents.ts` — newest-first list query with filters, joins, entry counts, and cursor pagination.
- Create: `src/modules/admin/application/queries/get-admin-source-document-detail.ts` — full-row detail query for one source document.
- Create: `src/modules/admin/ui/AdminSourceDocumentFilters.tsx` — URL-backed status/type/range/result filters.
- Create: `src/modules/admin/ui/AdminSourceDocumentDetailPanel.tsx` — grouped detail sections covering all `source_documents` columns plus helper fields.
- Create: `src/modules/admin/ui/AdminSourceDocumentsList.tsx` — scan-oriented table, empty states, pagination link, and expandable details.
- Create: `src/modules/admin/ui/AdminSourceDocumentStatusBadge.tsx` — reusable badge mapping for source-document statuses.

### New entries admin files

- Create: `src/app/[locale]/(protected)/admin/entries/page.tsx` — page composition for entry filters, list query, and optional expanded detail.
- Create: `src/modules/admin/application/queries/list-admin-entries.ts` — newest-first list query with filters, joins, and cursor pagination.
- Create: `src/modules/admin/application/queries/get-admin-entry-detail.ts` — full-row detail query for one ledger entry.
- Create: `src/modules/admin/ui/AdminEntryFilters.tsx` — URL-backed range/currency/category/source-link filters.
- Create: `src/modules/admin/ui/AdminEntryDetailPanel.tsx` — grouped detail sections covering all `ledger_entries` columns plus helper fields.
- Create: `src/modules/admin/ui/AdminEntriesList.tsx` — scan-oriented table, empty states, pagination link, and expandable details.

### New test files

- Create: `tests/unit/modules/admin/list-admin-source-documents.test.ts`
- Create: `tests/unit/modules/admin/get-admin-source-document-detail.test.ts`
- Create: `tests/unit/modules/admin/ui/AdminSourceDocumentFilters.test.tsx`
- Create: `tests/unit/modules/admin/ui/AdminSourceDocumentDetailPanel.test.tsx`
- Create: `tests/unit/modules/admin/ui/AdminSourceDocumentsList.test.tsx`
- Create: `tests/unit/modules/admin/list-admin-entries.test.ts`
- Create: `tests/unit/modules/admin/get-admin-entry-detail.test.ts`
- Create: `tests/unit/modules/admin/ui/AdminEntryFilters.test.tsx`
- Create: `tests/unit/modules/admin/ui/AdminEntryDetailPanel.test.tsx`
- Create: `tests/unit/modules/admin/ui/AdminEntriesList.test.tsx`

## Implementation Notes

- Follow the existing `/admin/tasks` patterns for:
  - search-param parsing in route pages
  - cursor encoding/decoding
  - filtered empty vs global empty states
  - expandable row details
  - URL-state reset behavior
- Keep raw-column visibility in the detail panels, not the table body.
- Reuse `AdminTaskJsonBlock` for JSON and array-like detail fields where practical.
- `source_documents.status` values come from `src/modules/source-document/types.ts` and should stay schema-backed.
- `ledger_entries` has no `entryDate`; use `createdAt` as the stable default ordering field.
- Use `git add -f` when committing plan/spec files under `docs/superpowers`, because the repo ignores that directory.

### Task 1: Add failing route-composition coverage for the two new admin pages

**Files:**
- Modify: `tests/unit/app/admin-route-composition.test.tsx`
- Modify: `src/app/[locale]/(protected)/admin/layout.tsx` (later, to satisfy tests)
- Create: `src/app/[locale]/(protected)/admin/source-documents/page.tsx` (later, minimal stub)
- Create: `src/app/[locale]/(protected)/admin/entries/page.tsx` (later, minimal stub)

- [ ] **Step 1: Write failing route-composition tests for the new pages and nav labels**

Add tests that:
- render admin layout and expect Source Documents + Entries nav items
- render `/admin/source-documents` with mocked query results
- render `/admin/entries` with mocked query results
- verify optional `detail` search params trigger the corresponding detail query

- [ ] **Step 2: Run the route-composition test file to verify failure**

Run: `npm run test:unit -- tests/unit/app/admin-route-composition.test.tsx`
Expected: FAIL because the new pages, query mocks, and nav items do not exist yet.

- [ ] **Step 3: Add minimal route stubs and nav wiring to satisfy imports**

Implement skeletal page files and expand `AdminShell` navigation in `src/app/[locale]/(protected)/admin/layout.tsx`:

```tsx
navItems={[
  { href: "/admin", label: t("overview") },
  { href: "/admin/users", label: t("users") },
  { href: "/admin/source-documents", label: t("sourceDocuments") },
  { href: "/admin/entries", label: t("entries") },
  { href: "/admin/tasks", label: t("tasks") },
]}
```

- [ ] **Step 4: Re-run the route-composition test file**

Run: `npm run test:unit -- tests/unit/app/admin-route-composition.test.tsx`
Expected: still FAIL, but now on missing query exports/types/translations rather than missing route files.

- [ ] **Step 5: Commit the route-foundation checkpoint**

```bash
git add src/app/[locale]/(protected)/admin/layout.tsx src/app/[locale]/(protected)/admin/source-documents/page.tsx src/app/[locale]/(protected)/admin/entries/page.tsx tests/unit/app/admin-route-composition.test.tsx
git commit -m "test: add admin source document and entry route coverage"
```

### Task 2: Define admin contracts and input schemas for source documents and entries

**Files:**
- Modify: `src/modules/admin/contracts.ts`
- Modify: `src/modules/admin/contract-schemas.ts`
- Modify: `src/modules/admin/queries.ts`
- Test: `tests/unit/app/admin-route-composition.test.tsx`

- [ ] **Step 1: Add failing schema/typing expectations in route tests if needed**

Assert the new pages pass strongly typed filter state and list/detail DTO props, mirroring `/admin/tasks`.

- [ ] **Step 2: Run the route-composition test again**

Run: `npm run test:unit -- tests/unit/app/admin-route-composition.test.tsx`
Expected: FAIL on missing admin DTO and parser exports.

- [ ] **Step 3: Add minimal contracts, list-input schemas, and query exports**

Define:
- `AdminSourceDocumentStatus`
- `AdminSourceDocumentType`
- `AdminSourceDocumentListItem`
- `AdminSourceDocumentDetail`
- `ListAdminSourceDocumentsInput/Result`
- `AdminEntryListItem`
- `AdminEntryDetail`
- `ListAdminEntriesInput/Result`
- new parsing helpers in `contract-schemas.ts`
- export placeholders from `queries.ts`

- [ ] **Step 4: Re-run the route-composition test**

Run: `npm run test:unit -- tests/unit/app/admin-route-composition.test.tsx`
Expected: FAIL on missing implementations rather than types.

- [ ] **Step 5: Commit the contracts checkpoint**

```bash
git add src/modules/admin/contracts.ts src/modules/admin/contract-schemas.ts src/modules/admin/queries.ts tests/unit/app/admin-route-composition.test.tsx
git commit -m "feat: add admin source document and entry contracts"
```

### Task 3: Implement source-document list query with tests first

**Files:**
- Create: `tests/unit/modules/admin/list-admin-source-documents.test.ts`
- Create: `src/modules/admin/application/queries/list-admin-source-documents.ts`
- Modify: `src/modules/admin/queries.ts`

- [ ] **Step 1: Write failing unit tests for `listAdminSourceDocuments`**

Cover:
- admin guard invocation
- newest-first ordering by `createdAt desc`, `id desc`
- filters for `status`, `type`, `range`, and `result`
- `userEmail` enrichment via ledger -> user join
- `entryCount` aggregation via `ledger_entries.sourceDocumentId`
- cursor pagination behavior
- distinct available type list if the page needs it
- empty result behavior

- [ ] **Step 2: Run the new query test file to verify failure**

Run: `npm run test:unit -- tests/unit/modules/admin/list-admin-source-documents.test.ts`
Expected: FAIL because `listAdminSourceDocuments` does not exist yet.

- [ ] **Step 3: Implement `list-admin-source-documents.ts` minimally to make the tests pass**

Use the existing task query pattern:
- `await requireSuperAdmin()` first
- parse input via Zod
- build deterministic conditions on `source_documents`
- left join `ledgers` and `users`
- compute `entryCount`
- apply stable ordering and cursor pagination
- map to admin DTOs only

- [ ] **Step 4: Re-run the source-document list query tests**

Run: `npm run test:unit -- tests/unit/modules/admin/list-admin-source-documents.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the source-document list query**

```bash
git add src/modules/admin/application/queries/list-admin-source-documents.ts src/modules/admin/queries.ts tests/unit/modules/admin/list-admin-source-documents.test.ts
git commit -m "feat: add admin source document list query"
```

### Task 4: Implement source-document detail query with tests first

**Files:**
- Create: `tests/unit/modules/admin/get-admin-source-document-detail.test.ts`
- Create: `src/modules/admin/application/queries/get-admin-source-document-detail.ts`
- Modify: `src/modules/admin/queries.ts`

- [ ] **Step 1: Write failing unit tests for `getAdminSourceDocumentDetail`**

Cover:
- admin guard invocation
- not-found behavior
- all primary `source_documents` columns are returned
- helper fields `userEmail` and `entryCount` are included and null-safe
- soft-deleted rows are excluded

- [ ] **Step 2: Run the detail-query test file to verify failure**

Run: `npm run test:unit -- tests/unit/modules/admin/get-admin-source-document-detail.test.ts`
Expected: FAIL because the detail query does not exist yet.

- [ ] **Step 3: Implement the source-document detail query**

Return a DTO that includes every `source_documents` column plus helper fields. Keep field names aligned with existing admin DTO naming.

- [ ] **Step 4: Re-run the detail-query test file**

Run: `npm run test:unit -- tests/unit/modules/admin/get-admin-source-document-detail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the source-document detail query**

```bash
git add src/modules/admin/application/queries/get-admin-source-document-detail.ts src/modules/admin/queries.ts tests/unit/modules/admin/get-admin-source-document-detail.test.ts
git commit -m "feat: add admin source document detail query"
```

### Task 5: Build source-document filters and detail panel with tests first

**Files:**
- Create: `tests/unit/modules/admin/ui/AdminSourceDocumentFilters.test.tsx`
- Create: `tests/unit/modules/admin/ui/AdminSourceDocumentDetailPanel.test.tsx`
- Create: `src/modules/admin/ui/AdminSourceDocumentFilters.tsx`
- Create: `src/modules/admin/ui/AdminSourceDocumentDetailPanel.tsx`
- Modify: `src/modules/admin/ui/index.ts`

- [ ] **Step 1: Write failing UI tests for source-document filters**

Cover:
- status/type/range/result filter changes update URL params
- reset clears `detail` and `cursor`
- existing limit is preserved when appropriate

- [ ] **Step 2: Write failing UI tests for the detail panel**

Cover:
- all source-document raw columns are rendered somewhere in the panel
- `metadata` and `imageUrls` render through a readable raw-data block
- null values use the not-available label
- status labels render correctly

- [ ] **Step 3: Run both UI test files to verify failure**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminSourceDocumentFilters.test.tsx tests/unit/modules/admin/ui/AdminSourceDocumentDetailPanel.test.tsx`
Expected: FAIL because the components do not exist yet.

- [ ] **Step 4: Implement the source-document filter and detail components minimally**

Reuse existing admin patterns:
- `Select`-based filters like `AdminTaskFilters`
- grouped detail sections like `AdminTaskDetailPanel`
- `AdminTaskJsonBlock` for `metadata` / `imageUrls`

- [ ] **Step 5: Re-run the source-document UI tests**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminSourceDocumentFilters.test.tsx tests/unit/modules/admin/ui/AdminSourceDocumentDetailPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit the source-document filter/detail UI**

```bash
git add src/modules/admin/ui/AdminSourceDocumentFilters.tsx src/modules/admin/ui/AdminSourceDocumentDetailPanel.tsx src/modules/admin/ui/index.ts tests/unit/modules/admin/ui/AdminSourceDocumentFilters.test.tsx tests/unit/modules/admin/ui/AdminSourceDocumentDetailPanel.test.tsx
git commit -m "feat: add admin source document filter and detail UI"
```

### Task 6: Build the source-document list page with tests first

**Files:**
- Create: `tests/unit/modules/admin/ui/AdminSourceDocumentsList.test.tsx`
- Modify: `tests/unit/app/admin-route-composition.test.tsx`
- Create: `src/modules/admin/ui/AdminSourceDocumentsList.tsx`
- Create: `src/modules/admin/ui/AdminSourceDocumentStatusBadge.tsx`
- Modify: `src/app/[locale]/(protected)/admin/source-documents/page.tsx`
- Modify: `src/modules/admin/ui/index.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Write failing list tests for source documents**

Cover:
- populated table rendering with compact columns
- empty state vs filtered-empty state
- details toggle link URL behavior
- next-page link behavior with preserved filters
- expanded detail rendering

- [ ] **Step 2: Extend route-composition tests with real source-document page behavior**

Assert:
- search params are parsed correctly
- `listAdminSourceDocuments` receives the intended input
- `getAdminSourceDocumentDetail` runs only when `detail` is set

- [ ] **Step 3: Run the list and route-composition tests to verify failure**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminSourceDocumentsList.test.tsx tests/unit/app/admin-route-composition.test.tsx`
Expected: FAIL because the list component, translations, and page composition are incomplete.

- [ ] **Step 4: Implement the source-document list page stack minimally**

Add:
- table component
- status badge
- page composition
- translations under `Admin.sourceDocuments` nav label and new `AdminSourceDocuments` namespace

- [ ] **Step 5: Re-run the list and route-composition tests**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminSourceDocumentsList.test.tsx tests/unit/app/admin-route-composition.test.tsx`
Expected: PASS for the source-document route/component coverage.

- [ ] **Step 6: Commit the source-document page stack**

```bash
git add src/app/[locale]/(protected)/admin/source-documents/page.tsx src/modules/admin/ui/AdminSourceDocumentsList.tsx src/modules/admin/ui/AdminSourceDocumentStatusBadge.tsx src/modules/admin/ui/index.ts messages/en.json messages/zh.json tests/unit/modules/admin/ui/AdminSourceDocumentsList.test.tsx tests/unit/app/admin-route-composition.test.tsx
git commit -m "feat: add admin source documents page"
```

### Task 7: Implement entry list query with tests first

**Files:**
- Create: `tests/unit/modules/admin/list-admin-entries.test.ts`
- Create: `src/modules/admin/application/queries/list-admin-entries.ts`
- Modify: `src/modules/admin/queries.ts`

- [ ] **Step 1: Write failing unit tests for `listAdminEntries`**

Cover:
- admin guard invocation
- newest-first ordering by `createdAt desc`, `id desc`
- filters for `range`, `currency`, `category`, and source-link state
- `userEmail` join behavior
- `categoryName` join behavior
- cursor pagination
- empty result handling

- [ ] **Step 2: Run the entry-list query tests to verify failure**

Run: `npm run test:unit -- tests/unit/modules/admin/list-admin-entries.test.ts`
Expected: FAIL because `listAdminEntries` does not exist yet.

- [ ] **Step 3: Implement `list-admin-entries.ts` minimally to satisfy the tests**

Return compact scan DTOs and stable filter metadata without exposing UI-only concerns.

- [ ] **Step 4: Re-run the entry-list query tests**

Run: `npm run test:unit -- tests/unit/modules/admin/list-admin-entries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the entry list query**

```bash
git add src/modules/admin/application/queries/list-admin-entries.ts src/modules/admin/queries.ts tests/unit/modules/admin/list-admin-entries.test.ts
git commit -m "feat: add admin entry list query"
```

### Task 8: Implement entry detail query with tests first

**Files:**
- Create: `tests/unit/modules/admin/get-admin-entry-detail.test.ts`
- Create: `src/modules/admin/application/queries/get-admin-entry-detail.ts`
- Modify: `src/modules/admin/queries.ts`

- [ ] **Step 1: Write failing unit tests for `getAdminEntryDetail`**

Cover:
- admin guard invocation
- not-found behavior
- all primary `ledger_entries` columns are returned
- helper fields `userEmail` and `categoryName` are included and null-safe
- optional source-document helper fields stay optional and non-breaking

- [ ] **Step 2: Run the entry-detail query tests to verify failure**

Run: `npm run test:unit -- tests/unit/modules/admin/get-admin-entry-detail.test.ts`
Expected: FAIL because the detail query does not exist yet.

- [ ] **Step 3: Implement the entry detail query**

Return every `ledger_entries` column plus the approved helper fields.

- [ ] **Step 4: Re-run the entry-detail query tests**

Run: `npm run test:unit -- tests/unit/modules/admin/get-admin-entry-detail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the entry detail query**

```bash
git add src/modules/admin/application/queries/get-admin-entry-detail.ts src/modules/admin/queries.ts tests/unit/modules/admin/get-admin-entry-detail.test.ts
git commit -m "feat: add admin entry detail query"
```

### Task 9: Build entry filters and detail panel with tests first

**Files:**
- Create: `tests/unit/modules/admin/ui/AdminEntryFilters.test.tsx`
- Create: `tests/unit/modules/admin/ui/AdminEntryDetailPanel.test.tsx`
- Create: `src/modules/admin/ui/AdminEntryFilters.tsx`
- Create: `src/modules/admin/ui/AdminEntryDetailPanel.tsx`
- Modify: `src/modules/admin/ui/index.ts`

- [ ] **Step 1: Write failing UI tests for entry filters**

Cover:
- range/currency/category/source-link updates in search params
- reset clears `detail` and `cursor`
- values are preserved across toggles

- [ ] **Step 2: Write failing UI tests for the entry detail panel**

Cover:
- all ledger-entry raw columns render in grouped sections
- helper fields `userEmail` and `categoryName` render
- nullable conversion/source fields use the not-available label

- [ ] **Step 3: Run the entry UI tests to verify failure**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminEntryFilters.test.tsx tests/unit/modules/admin/ui/AdminEntryDetailPanel.test.tsx`
Expected: FAIL because the components do not exist yet.

- [ ] **Step 4: Implement the entry filter and detail components minimally**

Mirror the source-document and task UI patterns for consistency.

- [ ] **Step 5: Re-run the entry UI tests**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminEntryFilters.test.tsx tests/unit/modules/admin/ui/AdminEntryDetailPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit the entry filter/detail UI**

```bash
git add src/modules/admin/ui/AdminEntryFilters.tsx src/modules/admin/ui/AdminEntryDetailPanel.tsx src/modules/admin/ui/index.ts tests/unit/modules/admin/ui/AdminEntryFilters.test.tsx tests/unit/modules/admin/ui/AdminEntryDetailPanel.test.tsx
git commit -m "feat: add admin entry filter and detail UI"
```

### Task 10: Build the entries list page with tests first

**Files:**
- Create: `tests/unit/modules/admin/ui/AdminEntriesList.test.tsx`
- Modify: `tests/unit/app/admin-route-composition.test.tsx`
- Create: `src/modules/admin/ui/AdminEntriesList.tsx`
- Modify: `src/app/[locale]/(protected)/admin/entries/page.tsx`
- Modify: `src/modules/admin/ui/index.ts`
- Modify: `messages/en.json`
- Modify: `messages/zh.json`

- [ ] **Step 1: Write failing list tests for entries**

Cover:
- populated table rendering with compact columns
- empty state vs filtered-empty state
- detail toggle URL behavior
- next-page link behavior with preserved filters
- expanded detail rendering

- [ ] **Step 2: Extend route-composition tests with the entries page**

Assert:
- `listAdminEntries` receives parsed search params
- `getAdminEntryDetail` only runs when `detail` is set
- the page renders the expected labels

- [ ] **Step 3: Run the entries list and route-composition tests to verify failure**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminEntriesList.test.tsx tests/unit/app/admin-route-composition.test.tsx`
Expected: FAIL because the entries page stack is incomplete.

- [ ] **Step 4: Implement the entries page stack minimally**

Add:
- entries table component
- page composition
- `AdminEntries` translations
- `Admin.entries` nav label

- [ ] **Step 5: Re-run the entries list and route-composition tests**

Run: `npm run test:unit -- tests/unit/modules/admin/ui/AdminEntriesList.test.tsx tests/unit/app/admin-route-composition.test.tsx`
Expected: PASS for the entries route/component coverage.

- [ ] **Step 6: Commit the entries page stack**

```bash
git add src/app/[locale]/(protected)/admin/entries/page.tsx src/modules/admin/ui/AdminEntriesList.tsx src/modules/admin/ui/index.ts messages/en.json messages/zh.json tests/unit/modules/admin/ui/AdminEntriesList.test.tsx tests/unit/app/admin-route-composition.test.tsx
git commit -m "feat: add admin entries page"
```

### Task 11: Run focused verification, then full project checks

**Files:**
- Modify: any files still failing from prior tasks
- Test: all new admin-related tests plus existing admin suites

- [ ] **Step 1: Run the focused new-admin test suite**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/admin/list-admin-source-documents.test.ts \
  tests/unit/modules/admin/get-admin-source-document-detail.test.ts \
  tests/unit/modules/admin/ui/AdminSourceDocumentFilters.test.tsx \
  tests/unit/modules/admin/ui/AdminSourceDocumentDetailPanel.test.tsx \
  tests/unit/modules/admin/ui/AdminSourceDocumentsList.test.tsx \
  tests/unit/modules/admin/list-admin-entries.test.ts \
  tests/unit/modules/admin/get-admin-entry-detail.test.ts \
  tests/unit/modules/admin/ui/AdminEntryFilters.test.tsx \
  tests/unit/modules/admin/ui/AdminEntryDetailPanel.test.tsx \
  tests/unit/modules/admin/ui/AdminEntriesList.test.tsx \
  tests/unit/app/admin-route-composition.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the pre-existing admin regression suite**

Run:

```bash
npm run test:unit -- \
  tests/unit/modules/admin/access.test.ts \
  tests/unit/modules/admin/list-admin-users.test.ts \
  tests/unit/modules/admin/list-admin-tasks.test.ts \
  tests/unit/modules/admin/get-admin-task-detail.test.ts \
  tests/unit/modules/admin/ui/AdminShell.test.tsx \
  tests/unit/modules/admin/ui/AdminUsersList.test.tsx \
  tests/unit/modules/admin/ui/AdminTaskFilters.test.tsx \
  tests/unit/modules/admin/ui/AdminTaskDetailPanel.test.tsx \
  tests/unit/modules/admin/ui/AdminTasksList.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run repo validation relevant to touched areas**

Run:

```bash
npm run lint
npm run tsc
npm run validate:i18n
```

Expected: PASS.

- [ ] **Step 4: Commit final polish after all checks pass**

```bash
git add src/app/[locale]/(protected)/admin src/modules/admin messages/en.json messages/zh.json tests/unit/app/admin-route-composition.test.tsx tests/unit/modules/admin
git commit -m "feat: add admin source document and entry visibility"
```

### Task 12: Final documentation and handoff

**Files:**
- Modify: `README.md` if admin navigation documentation needs an update
- Modify: `docs/operations/runbook.md` only if the admin backend route inventory is documented there

- [ ] **Step 1: Check whether existing docs mention the old admin route set only**

Run:

```bash
rg -n "/admin/users|/admin/tasks|Admin Backend|admin routes" README.md docs
```

Expected: identify whether any route inventory is now stale.

- [ ] **Step 2: If stale docs exist, add the minimal route-list update**

Only update documentation that would otherwise be factually wrong after shipping the feature.

- [ ] **Step 3: Run targeted doc validation if any docs changed**

Run:

```bash
npm run validate:i18n
```

Expected: PASS.

- [ ] **Step 4: Commit any required doc follow-up**

```bash
git add README.md docs/operations/runbook.md
if ! git diff --cached --quiet; then git commit -m "docs: update admin route inventory"; fi
```

## Notes for the implementing worker

- Keep source-document and entry pages visually parallel to `/admin/tasks`; do not invent a new admin page style.
- Favor helper functions shared within each component file over broad abstractions unless duplication becomes concrete.
- Preserve URL-state behavior: changing filters should clear `cursor` and `detail` consistently.
- Make detail sections complete and trustworthy: every raw primary-table column must be visible somewhere.
- Avoid adding speculative actions, cross-links, or dashboards while implementing this plan.
