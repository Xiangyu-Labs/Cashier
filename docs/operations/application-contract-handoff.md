# Application Contract Handoff

Date: 2026-07-17

Frozen baseline: `cashier-application-contracts@1.0.0`.

This handoff is the only application-layer baseline for later Neon, R2, Queue/Worker, and
Vercel work. The current implementation remains Docker, SQLite, local storage, and in-process
target processing. No managed provider was provisioned, connected, or written by this change.

## Versioned Contracts

| Contract        | Version | Authoritative implementation                                            |
| --------------- | ------- | ----------------------------------------------------------------------- |
| Source document | 1.0.0   | `src/application/contracts/index.ts` and `SourceDocumentPort`           |
| Revision        | 1.0.0   | `SourceDocumentRevisionContract` and revision state suites              |
| Stored file     | 1.0.0   | `StoredFilePort`, trusted metadata, and authorized reads                |
| Upload plan     | 1.0.0   | upload plan, target, finalization, expiry, and limits contracts         |
| Processing      | 1.0.0   | intent, claim, retry, completion, recovery, and deduplication contracts |
| Authorization   | 1.0.0   | ledger ownership and cross-workspace denial suites                      |
| Idempotency     | 1.0.0   | concurrent API/application idempotency contracts                        |
| Errors          | 1.0.0   | sanitized `ApplicationErrorContract` and stable codes                   |
| Read DTOs       | 1.0.0   | bounded source-document and ledger read models                          |

Stable error codes are `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `RATE_LIMITED`, `PROCESSING_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, and `INTERNAL`.
Replacement adapters may add protected diagnostics, but client responses must remain within this
set until a separately reviewed OpenSpec change revises the application contract.

## Fixtures, Suites, And Invariants

The API v1 fixture is `tests/fixtures/api-v1/source-documents.post.json`. API v1 remains version
`v1`; deprecated response field `status` is retained through 2026-10-13 and maps directly from
`revisionState`. Removing it requires a later explicitly approved API change.

Reusable contract authority:

- `tests/helpers/application-contract-suites.ts`
- `tests/unit/application/contract-suites.test.ts`
- `tests/integration/application/current-runtime-contract-suite.test.ts`
- `tests/integration/application/processing-dispatcher.test.ts`
- `tests/integration/application/contract-release.test.ts`
- `tests/integration/api/source-documents-route.test.ts`
- `tests/integration/api/stored-files-route.test.ts`

Required invariants are stable document identity; immutable submitted revision evidence; atomic
active/pending transitions and ledger projections; prior active-result preservation; ordered file
identity; ownership before reads or writes; concurrent idempotency; restart-safe processing;
duplicate dispatch safety; sanitized errors; bounded DTOs; soft deletion by target `deleted_at`;
and no physical deletion of legacy rows, task history, image references, or files.

The accepted current adapters are SQLite revision/ledger/settings/auth/credential/idempotency,
local stored-file/upload/finalization/authorized-read, and SQLite outbox plus in-process target
processing. Their automated suites are the reference behavior, not their provider mechanics.

## Replacement Adapter Boundaries

| Provider     | Ports to replace                                                                            | Required suites                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Neon         | revision, ledger projection/read, settings, authentication, service credential, idempotency | revision state, authorization, bookkeeping, concurrent idempotency, error sanitation, bounded reads                          |
| R2           | stored file, upload plan, upload target, finalization, authorized read                      | upload/finalization, limits/expiry, ownership denial, ordered identity, authorized file read, error sanitation               |
| Queue/Worker | processing intent, dispatch, claim, retry classification, completion, deduplication         | restart recovery, duplicate/stale dispatch, lease/claim, terminal outcome, active-result preservation, sanitized diagnostics |
| Vercel       | host the existing Next.js upper layer and compose replacement adapters                      | API v1 fixture, retained behavior suites, bounded/sensitive responses, authentication and runtime startup checks             |

Vercel does not own a business port and must not alter upper business contracts. If any provider
limit requires an upper contract change, implementation stops and a new OpenSpec change must be
approved before callers, DTOs, or behavior change.

## Recovery And Runtime Boundary

After contract release, image-only rollback is insufficient because target writes no longer
maintain the prior-image compatibility projection. Recovery must restore the coordinated task 9
SQLite/WAL/upload snapshot (or a verified copy of it) before starting the prior image. Legacy data
and files remain recovery evidence and are not cleaned up by this release.

All database data remains in SQLite, all files remain in local storage or coordinated local copies,
and local Docker remains the verification and supported runtime for this change. Cross-provider
export/import, managed-provider provisioning, Vercel cutover, DNS/traffic changes, and production
release are owned by the updated `migrate-managed-infrastructure-foundation` change.
