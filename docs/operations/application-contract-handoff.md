# Application Contract Handoff

Date: 2026-07-17
Updated: 2026-07-18

Frozen baseline: `cashier-application-contracts@2.0.0` (upgraded from 1.0.0 on 2026-07-18).

## Follow-up: Vercel-compatible processing (2026-07-18)

The execution boundary changed from Queue/Worker to Next.js `after()` for request-bound
processing. The global drain loop was removed in favor of scheduling via `after()` on the same
request. See `docs/formless/plans/2026-07-18-vercel-compatible-ai-processing.md` for the full plan.

- Queue/Worker replacement adapters are **deferred** pending measured Vercel `maxDuration` limits.
- The `after()` seam is the current accepted schedule boundary; it requires no external queue.
- A startup dispatcher and `MAX_TASK_WORKER` are no longer needed.
- Retry-after-failure tests verify the new scheduling path.

This handoff is the only application-layer baseline for later Neon, R2, and
Vercel work. The current implementation remains Docker, SQLite, local storage, and in-process
target processing -- now scheduled via Next.js after() rather than a global drain loop.
No managed provider was provisioned, connected, or written by this change.

## What Changed From 1.0.0 to 2.0.0

The application contract was bumped to 2.0.0 on 2026-07-18 as part of the remaining-product-review
remediation (`fix/review-remediation-tasks` branch). Breaking changes:

- **Credential DTO**: `ServiceCredentialContract` and `CreatedServiceCredentialContract` gained
  `tokenPrefix` and `tokenSuffix` fields. The raw `key` is no longer exposed through the application
  contract; only the prefix/suffix identifier pair is returned in list/create responses.
- **Money DTO**: `LedgerProjectionEntryContract.amount`, `convertedAmount`, and `exchangeRate`
  changed from `number` to `string` (canonical decimal representation). All application-layer
  money values are now decimal strings; JavaScript number is only used at display boundaries.
- **Revision outcomes**: The `REVISION_OUTCOMES` tuple added `"abandoned"` as an explicit terminal
  state for candidate revisions that were explicitly abandoned via the Abandon action.
- **Supported actions**: `SupportedSourceDocumentAction` added `"accept_candidate"` and
  `"abandon_candidate"` for the candidate lifecycle. The `supportedSourceDocumentActions` function
  now returns these when a completed pending revision exists alongside an active revision.
- **Processing recovery config**: `ProcessingRecoveryConfig` was introduced with `maxBatch`,
  `maxAttempts`, and `cooldownSeconds`. `RecoverableProcessingIntentContract` added
  `scheduleAttemptCount` and `nextAvailableAt` for bounded request-triggered recovery.
- **Stable diagnostic codes**: `ANOMALY_CODES` and `PROCESSING_FAILURE_CODES` were added as
  stable, user-facing error taxonomies. `AnomalyCode`, `ProcessingFailureCode`,
  `toStableFailureCode`, and `toStableAnomalyCode` provide mapping from legacy values.

API v1 remains behaviorally unchanged and continues returning its original format through the
deprecated sunset date (2026-10-13). The `APPLICATION_CONTRACT_VERSION` constant reflects the
internal application contract only; API v1 has separate versioning.

## Versioned Contracts

| Contract        | Version | Authoritative implementation                                            |
| --------------- | ------- | ----------------------------------------------------------------------- |
| Source document | 2.0.0   | `src/application/contracts/index.ts` and `SourceDocumentPort`           |
| Revision        | 2.0.0   | `SourceDocumentRevisionContract` and revision state suites              |
| Stored file     | 2.0.0   | `StoredFilePort`, trusted metadata, and authorized reads                |
| Upload plan     | 2.0.0   | upload plan, target, finalization, expiry, and limits contracts         |
| Processing      | 2.0.0   | intent, claim, retry, completion, recovery, and deduplication contracts |
| Authorization   | 2.0.0   | ledger ownership and cross-workspace denial suites                      |
| Idempotency     | 2.0.0   | concurrent API/application idempotency contracts                        |
| Errors          | 2.0.0   | sanitized `ApplicationErrorContract` and stable codes                   |
| Read DTOs       | 2.0.0   | bounded source-document and ledger read models                          |

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

| Provider                | Ports to replace                                                                            | Required suites                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Neon                    | revision, ledger projection/read, settings, authentication, service credential, idempotency | revision state, authorization, bookkeeping, concurrent idempotency, error sanitation, bounded reads                          |
| R2                      | stored file, upload plan, upload target, finalization, authorized read                      | upload/finalization, limits/expiry, ownership denial, ordered identity, authorized file read, error sanitation               |
| Queue/Worker [DEFERRED] | processing intent, dispatch, claim, retry classification, completion, deduplication         | restart recovery, duplicate/stale dispatch, lease/claim, terminal outcome, active-result preservation, sanitized diagnostics |
| Vercel                  | host the existing Next.js upper layer and compose replacement adapters                      | API v1 fixture, retained behavior suites, bounded/sensitive responses, authentication and runtime startup checks             |

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
