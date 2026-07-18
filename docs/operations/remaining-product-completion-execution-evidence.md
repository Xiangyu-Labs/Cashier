# Remaining Product Completion -- Execution Evidence

Date: 2026-07-18

Branch: `fix/review-remediation-tasks` (based on `main` at `205c4f5c`)

Plan: `docs/formless/plans/2026-07-18-remaining-product-review-remediation.md`
Review: `docs/operations/remaining-product-completion-review-2026-07-18.md`

## Commit-to-Task Mapping

| Commit        | Task       | Description                                                                               |
| ------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `8fa9fd7d`    | 1          | Enforce transactional candidate and main-currency invariants with row locks               |
| `b81732bd`    | 1 (review) | Lock SD rows in activate/ensureTarget, add Abandon/Retry test, verify settings invariants |
| `6ebac4a0`    | 2          | Complete decimal money migration from AI input through UI contracts                       |
| `ce3107a4`    | 3          | Separate recovery batch size from attempt exhaustion and restore CAS                      |
| `fbf8608e`    | 4          | Scrub credential plaintext from all rows and complete migration gate                      |
| `3f03f5f5`    | 4 (review) | Scrub mismatch leak and add tx lock in clear-plaintext                                    |
| `94678f59`    | 5          | Enforce aggregate file count at schema, use-case, and transaction layers                  |
| `9ea237f2`    | 6          | Version contract to 2.0.0, close progress, lint cleanup, execution evidence               |
| (this commit) | 4 (final)  | Execute production credential migration, remove plaintext fallback and column             |

## Findings Closure Matrix

| Finding | Severity                                  | Resolution Task | Status | Evidence                                                                                             |
| ------- | ----------------------------------------- | --------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| P0-01   | Candidate Accept/Abandon race condition   | Task 1          | CLOSED | Row locks via `SELECT FOR UPDATE`, ConflictError on CAS failure, concurrent Promise.allSettled tests |
| P0-02   | Incomplete decimal money migration        | Task 2          | CLOSED | AI parser schema uses z.string(), decimal allocation, batch conversion, end-to-end tests             |
| P1-01   | Main currency concurrent window           | Task 1          | CLOSED | Shared ledger lock between settings update and first entry creation, concurrent interleaving tests   |
| P1-02   | Recovery batch/attempt confusion and CAS  | Task 3          | CLOSED | Separate maxBatch/maxAttempts config, CAS exhaustion with source-document join, boundary tests       |
| P1-03   | Deleted credential plaintext leak         | Task 4          | CLOSED | Production backfill/clear/final verify, hash-only schema, validated active-credential constraint     |
| P1-04   | Aggregate file count bypass               | Task 5          | CLOSED | superRefine aggregate check, use-case re-check, transaction-level authoritative check                |
| P2-01   | Progress and delivery evidence not closed | Task 6          | CLOSED | Contract 2.0.0, handoff/release docs updated, findings resolutions added, lint cleanup               |

## Verification Summary

Run at 2026-07-18 on `fix/review-remediation-tasks`, including the final production credential migration closure changes.

### Full Gate (`npm run check`)

All stages passed:

| Stage                           | Result                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint                          | 0 errors, 61 warnings (26 warnings removed from plan-modified files; remaining are generated SW/Workbox files and pre-existing warnings in unmodified files) |
| TypeScript (`tsc --noEmit`)     | No errors                                                                                                                                                    |
| Unit tests                      | 147 files, 910 tests passed                                                                                                                                  |
| Integration tests               | 59 files, 361 tests passed                                                                                                                                   |
| Coverage run                    | 206 files, 1271 tests passed; statements 63.86%, branches 57.69%, functions 61.45%, lines 64.94%                                                             |
| Next.js 16.1.7 production build | Passed                                                                                                                                                       |
| i18n catalogs (zh/en)           | Both validated                                                                                                                                               |
| `git diff --check`              | Passed (no trailing whitespace or merge-conflict markers)                                                                                                    |

### API v1 Compatibility

API v1 fixture (`tests/fixtures/api-v1/source-documents.post.json`) continues to pass. The `APPLICATION_CONTRACT_VERSION` bump to 2.0.0 does not change external API behavior, request format, HTTP status codes, or response fields.

### Lint Warning Reduction

Warnings reduced from 87 to 61 (26 removed). Files cleaned up in this plan:

- `src/application/adapters/in-process/revision-processor.ts`: removed unused `acceptCandidateRevision` import
- `src/application/adapters/postgres/business-ports.ts`: removed unused `parse`, `add`, `subtract`, `authenticateToken`, `prefixSuffix` imports
- `src/application/adapters/postgres/ledger-projections.ts`: removed unused `ledgers` import
- `src/application/adapters/postgres/revisions.ts`: removed unused `locked` variable
- `tests/integration/api/service-credentials.test.ts`: removed 6 unused imports/variables
- `tests/integration/application/processing-dispatcher.test.ts`: removed 2 unused `ledgerId` destructures
- `tests/integration/application/processing-recovery.test.ts`: removed 7 unused variables (`ledgerA`, `ledgerId`, `exhausted` x3)
- `tests/integration/modules/source-document/application/use-cases/source-document-candidates.test.ts`: removed unused `asc` and `revisionEntries` imports
- `tests/unit/modules/currency/application/use-cases/convert-currency.test.ts`: removed unused `convertSpy`

Remaining 61 warnings are from generated files (`public/sw.js`, `public/workbox-*.js`) and pre-existing issues in files not modified by this plan (per task policy: do not fix warnings in unrelated files).

## Remaining Open Items

1. **Browser acceptance**: NOT VERIFIED. No browser instance was available in the current environment. Desktop and mobile viewport acceptance for Stream pagination/load-more, Header counts, candidate actions, diagnostic text, dialogs, focus, and text overflow remain unverified. This must be completed in a browser-capable environment before marking the overall delivery as fully accepted.

## Completed Operational Items

**Production credential migration**: COMPLETED on 2026-07-18 against the database shared by the local and production environments. Two active credentials were backfilled, pre-clear verification reported 0 invalid credentials, plaintext was cleared, final verification reported 0 invalid and 0 plaintext rows, and a pre-migration token matched exactly one active hash after clear. Migrations `0004` and `0005` removed the legacy `key` column and added a validated active-hash constraint. See `docs/operations/hash-service-credentials-evidence.md`.
