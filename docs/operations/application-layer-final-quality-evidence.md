# Application-Layer Final Quality Evidence

Date: 2026-07-17

Scope: OpenSpec tasks 8.8 and 8.9 for
`prepare-production-ready-application-layer`. All snapshot and container checks used the approved
local production-shape copy and a fresh temporary restore. No production system or managed
provider was connected.

## Browser Acceptance Waiver

Tasks 8.6 and 8.7 are **WAIVED by explicit user decision on 2026-07-16; automated coverage
retained; no browser/manual acceptance claimed.** Browser interaction observations, screenshots,
desktop acceptance, and mobile acceptance were not performed and are not reported as passed.

## Final Measurements

The removal baseline deferred request counts, polling, response sizes, and interaction observations,
so those columns have no numeric pre-change value to compare. The available build and automated
suite values are compared directly.

| Measurement                   | Removal baseline                                                   | Final result                                                                                    |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Detail loading                | Not recorded                                                       | One bounded action request; no duplicate request                                                |
| Text-only upload preparation  | Not recorded                                                       | Zero upload-plan, upload-target, or finalize requests                                           |
| Two-image upload preparation  | Not recorded                                                       | One plan, two ordered target PUTs, one finalize; no duplicate phase                             |
| No queued/processing revision | Not recorded                                                       | Zero refresh timer and zero refresh listeners                                                   |
| Queued/processing revisions   | Not recorded                                                       | One shared 3-second timer and one four-listener global set; duplicate scope callback suppressed |
| Source-document list DTO      | Not recorded                                                       | 3,045 bytes for a seven-item page; asserted below 10,000 bytes                                  |
| Ledger-entry list DTO         | Not recorded                                                       | 5,342 bytes for a seven-item page; asserted below 15,000 bytes                                  |
| Unit suite                    | 140 files / 785 tests                                              | 141 files / 794 tests                                                                           |
| Integration suite             | 59 files / 309 tests                                               | 67 files / 341 tests                                                                            |
| Coverage suite                | 199 files / 1,094 tests                                            | 208 files / 1,135 tests                                                                         |
| Coverage                      | lines 61.34%, statements 60.46%, functions 54.77%, branches 53.85% | lines 64.31%, statements 63.33%, functions 59.81%, branches 58.25%                              |
| Next.js compile               | 8.4 seconds                                                        | 11.4 seconds on the final host check; 12.0 seconds in the final Docker build                    |
| Full check wall time          | 108.24 seconds                                                     | 143.00 seconds with the expanded suites                                                         |
| Build output                  | Retained routes only                                               | Same retained route surface; `.next/standalone` 75 MB and `.next/static` 4.5 MB                 |
| Production image              | Docker unavailable at baseline                                     | 351,549,847 bytes; `sha256:77065352649f164064af4eb14ca43f79d4fc96dd761d1bf83d871a5bf2909cae`    |

The final build is slower than the historical host baseline, while executing more tests and a newer
Next.js patch release. Repeated final builds completed without a route or output expansion. A real
SQLite build-lock regression was found during Docker rebuild and fixed by establishing WAL in the
single-process migration runner before parallel Next.js workers import the database.

Automated retained-workflow measurement passed 15 focused request, refresh, and DTO tests. The
bounded DTO inspections reject source text in lists, local URLs and paths, storage keys, internal
revision fields, and unrelated entry detail.

## Final Quality Gates

- Retained capability matrix: 16 files and 95 tests passed for target reads/writes, manual and AI
  submission, retry/edit retry, bookkeeping, currency, Stats, OTP, service credentials, API,
  stored-file access, bounded DTOs, refresh, and retained automated accessibility behavior.
- `npm run check`: passed ESLint, TypeScript, 141/794 unit tests, 67/341 integration tests,
  208/1,135 coverage tests, production Next.js build, and both locale catalogs. The first attempt
  encountered a transient Node 26/Vitest process segmentation fault; the unit suite and two later
  complete checks passed.
- Production Docker image: built successfully after the WAL initialization fix. The image runs as
  `node`, uses `./docker-entrypoint.sh`, and contains the migration/backfill runtime.
- API v1 compatibility and sensitive-response suite: 11 files and 52 tests passed. Authenticated
  `POST /api/v1/source-documents`, concurrent idempotency, the deprecated `status` field, target
  revision fields, stored-file authorization, and sanitized error contracts remain covered.
- OpenSpec strict validation and `git diff --check` are required after this evidence and task status
  are written; their final result is recorded in the handoff report.

## Restored-Snapshot And Restart Smoke

The read-only inventory of the approved local source copy reported SQLite `quick_check: ok`, zero
foreign-key violations, 42 applied migrations, 991 source documents, 983 local files, and
157,318,937 local bytes. A fresh temporary restore included its SQLite/WAL state and local upload
copy.

The first real container entrypoint exposed one regression: one target-native document was being
mistaken for legacy backfill input and blocked reconciliation with `missing_revision`. The backfill
now excludes documents that already have a target-native revision while continuing to backfill a
later legacy document with no revision. A five-test migration regression suite passed.

After the fix, initial container startup and explicit restart both reported:

- schema migrations complete;
- 656 eligible legacy documents, zero backfill batches, and zero applied documents;
- 334 excluded-deleted documents;
- zero excluded-deleted target revisions, pointers, or ledger projections;
- zero unresolved reconciliation differences;
- HTTP 200 for `/en/login` with a 39,648-byte response;
- SQLite `quick_check: ok` and zero foreign-key violations after restart.

The excluded-deleted source-row hash, excluded-deleted ledger-entry hash, and complete upload-copy
hash were identical before startup and after restart. The excluded population remained 334 and its
target revision/projection counts remained zero. No production data was mutated.

Container smoke used `MAX_TASK_WORKER=0` and local dummy credentials so it could not call an AI,
email, or managed infrastructure provider. Restart/duplicate processing recovery remains exercised
by the in-process dispatcher and adapter contract suites; the restored snapshot had zero pending or
claimed processing-outbox rows.

## Sensitive Responses

The live local login response and unauthenticated API response were scanned for task IDs/records,
local paths, storage keys, raw prompts, raw AI output, credentials, stack traces, SQLite details,
OpenAI material, and provider errors. There were zero matches. The API response was the bounded
88-byte `UNAUTHENTICATED` error and did not expose internal diagnostics. Contract and integration
tests separately cover authenticated list/detail/API and stored-file responses.
