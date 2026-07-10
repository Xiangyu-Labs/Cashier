# Task 2 Report: Remove Ledger Entry Search Query Plumbing

## Status: DONE_WITH_CONCERNS

## Commit
- `7d1080c6` — refactor: remove ledger entry search queries

## Test Summary
- Focused unit tests: **5/5 pass** (2 test files)
- Full suite: **1278 pass, 6 fail, 20 skip** (231 pass, 1 fail, 1 skip)
- The 6 failures are in `tests/integration/ledger-search.test.ts`, which is OUTSIDE this task's scope (not in the 5-file list). These failures are pre-existing from Task 1 (search field removed from Zod schemas).

## Files Modified
1. `tests/unit/ledger/application/queries/build-ledger-entry-filters.test.ts` — Removed 2 search-specific tests, added combined category/currency/amount filter test
2. `tests/unit/ledger/application/queries/list-ledger-entries.test.ts` — Removed search pass-through test
3. `src/modules/ledger/application/queries/build-ledger-entry-filters.ts` — Removed `searchQuery` from `LedgerEntryFilterParams`, removed the SQL search block (LIKE + subquery on source documents), cleaned up imports (`inArray`, `like`, `db`, `sourceDocuments` no longer needed)
4. `src/modules/ledger/application/queries/list-ledger-entries.ts` — Removed `validated.search` -> `filters.searchQuery` pass-through line
5. `src/modules/ledger/application/queries/calculate-ledger-stats.ts` — Removed `search` from filters type, removed search pass-through block

## Concerns
- `tests/integration/ledger-search.test.ts` (6 tests) fails because it passes `search` to `listLedgerEntries` and `getSourceDocumentCollection`, but the Zod schemas no longer accept `search`. This file was not in the task scope and needs to be handled in a follow-up task (either removed or updated).
- No other regressions detected.

## Self-Review Notes
- All edits match the brief exactly — imports, interface, condition blocks all removed as specified.
- The `db` and `sourceDocuments` imports were removed from `build-ledger-entry-filters.ts`; `inArray` and `like` from drizzle-orm also removed. No unused imports remain in the file.
- No migration files were edited.
- No date/category/currency/amount filtering was affected.
