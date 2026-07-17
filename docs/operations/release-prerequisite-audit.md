# Release Prerequisite Evidence Audit

Date: 2026-07-17

Scope: pre-task-9 evidence audit for `prepare-production-ready-application-layer`. This audit used
repository commits, local immutable image IDs, the approved production-shape copy, existing backup
attestation, isolated Docker restores, and operations documents. It did not connect to or modify a
production database, production upload volume, or production container. No deployment was run.

## Release Identities And Hard Stop

| Field | Recorded value | Audit result |
| --- | --- | --- |
| Implementation base | `c223d539b673ce7c7f926e026aba6baf97b69733` | Recorded on the isolated removal branch |
| Removal commit | `6505c8a12606037bddf1d6298964b72398264280` | Historical release boundary |
| Expand-only commit | `a112a260f4b7ae4e79239a1552ce384dc569578f` | Historical release boundary |
| Switch-candidate commit | `bfb63420502f84c87988d38e0c320da055ad5a4e` | Current `HEAD` |
| Candidate image | `sha256:77065352649f164064af4eb14ca43f79d4fc96dd761d1bf83d871a5bf2909cae` | Local image only; includes the current uncommitted WAL/backfill fixes, so it is not yet an immutable commit-to-image release record |
| Current production prior image | **Missing** | Must be read from the production host by the production operator; local images are not substitutes |
| Local rollback-rehearsal image | `sha256:8c2020c6fee9285d1f8c25ed3fc16bbcba5b95ccd33978a61033bcfc9d015d5d` | Local historical image only; explicitly not asserted to be the deployed production image |

An exact production rollback command cannot be truthfully finalized until the current production
prior-image digest is supplied. This remains a release hard stop. The required command form is:

```bash
CASHIER_IMAGE="ghcr.io/xiangyu-labs/cashier@sha256:<current-production-prior-digest>" \
  SKIP_MIGRATIONS=true docker compose up -d --no-build app
```

The exact image selector exercised in the local candidate rollback was:

```bash
CASHIER_IMAGE="sha256:8c2020c6fee9285d1f8c25ed3fc16bbcba5b95ccd33978a61033bcfc9d015d5d" \
  SKIP_MIGRATIONS=true docker compose up -d --no-build app
```

## Snapshot Inventory And Excluded Population

The aggregate-only inventory of `data/sqlite.db` and `data/uploads` on 2026-07-17 reported:

- SQLite `quick_check: ok`, zero foreign-key violations, and 42 applied migration records;
- 991 source documents: 657 active and 334 deleted;
- source states: 644 completed, 7 anomaly, 1 failed, 5 queued, and 334 deleted;
- 1,043 legacy task rows, including 7 `running` parse tasks; a read-only join proved all seven
  belong to deleted source documents;
- 943 image references, including 4 missing local references; the accepted backfill evidence proves
  all four belong only to excluded deleted documents;
- 983 local files totaling 157,318,937 bytes, with zero symlinks or unsupported entries.

These are accepted source anomalies, not silently resolved rows. They remain part of the excluded
recovery population and must not become target projections.

The fresh candidate restore copied SQLite, the present WAL/SHM state, and the complete upload tree.
Before first start and after explicit restart, the following values were identical:

| Check | Result |
| --- | --- |
| Excluded deleted documents | 334 |
| Excluded target revisions / pointers / projections | 0 / 0 / 0 |
| Excluded source-row SHA-256 | `7cbd898f4008f0d6664329bb90dded31f86c4cb1fc6ff6e1573ccf268def66c5` |
| Excluded ledger-entry SHA-256 | `d59a68392fed661b91e35fde71e8dbe3eba56da2885294f1f8a93a12315fb2be` |
| Complete upload-copy SHA-256 | `0bec6155a3c71b65f479c7c258b9bb63f57113c3ad06b0556f6a815a67a7d9c2` |
| Upload files | 983 |

This independently confirms that the excluded deleted population remained unchanged. The existing
backfill record states that the owner approved the production-shape copy and confirmed the
coordinated backup on 2026-07-14. The backup's external identifier or manifest is not present in
this repository and is still required at the production release gate.

## Docker Release Rehearsals

All containers used dummy local credentials and isolated temporary copies. No managed provider was
called. Temporary containers were removed after each check.

### Removal-only release

- Base image: commit `c223d539`, local image ID
  `sha256:2ca6aa961002d32094ce6852346bc789d4eff5115264841f871bc05151a7d1a2`.
- Removal image: commit `6505c8a1`, local image ID
  `sha256:78b5ccb9d5f7717a2a303517401af4350d0c2d0c6624495da020e5fb76520a03`.
- The removal entrypoint upgraded the restored historical copy to 39 Drizzle records, started, and
  returned HTTP 200 for `/en/login`.
- The database contained none of `source_document_revisions`, `stored_files`, or
  `processing_outbox`; removal therefore introduced no target-model schema.
- The base image then started against the same copy with `SKIP_MIGRATIONS=true` and returned HTTP
  200. This closes the local build/migration/rollback evidence for task 2.7, not production task 2.8.

### Expand-only release

- Expand image: commit `a112a260`, local image ID
  `sha256:e68938227933662ff785e3676f03369d8fa46485a3c5e0dbef947c3f9d5c86f8`.
- Its real entrypoint upgraded a fresh historical copy from 32 to 40 Drizzle records and returned
  HTTP 200 for `/en/login`.
- All new target tables were empty. Static commit inspection found no upper-layer target-table read;
  the only non-persistence occurrence was a compatibility comment.
- Authenticated API v1 write smoke returned HTTP 201 and created a legacy source/task record while
  `source_document_revisions` remained empty.
- The removal image started against the expanded copy, and again after the API write, using
  `SKIP_MIGRATIONS=true`; both rollback starts returned HTTP 200.
- This closes task 4.8. Task 4.7 remains open because the available image evidence does not include
  a positive authenticated Stream/Details/Stats read smoke against the expanded copy.

### Current candidate

- Candidate first start and explicit restart on the fresh restored copy both returned HTTP 200.
- Entry-point reconciliation remained at zero unresolved differences.
- Rollback to the local historical image ID `sha256:8c2020...015d5d` with migrations skipped
  returned HTTP 200.
- This is a local compatibility rehearsal only. It does not identify the production prior image and
  does not start task 9.1 or satisfy task 9.2.

## API v1 Client And Deprecated URL Audit

- Repository callers: none outside the API route and tests.
- Published v1 write response: `sourceDocumentId`, `revisionId`, `revisionState`, and deprecated
  `status`; the additive compatibility window is documented through 2026-10-13.
- Published v1 responses expose no task ID, task record, task progress, local image URL, storage key,
  or filesystem path.
- Legacy `image_urls` and `/api/uploads/...` construction remains only inside current-runtime
  adapters and compatibility projections for old-image rollback. Normal target DTOs use stored-file
  identities and authorized reads.
- External client identities and their field/URL dependencies cannot be inferred from this
  repository. A production-owner attestation is still required, so task 1.7 remains open.

## Release Controls

The existing removal runbook defines the following proposed controls; they are not approved merely
by being documented:

| Control | Current evidence state |
| --- | --- |
| Maintenance window | 30 minutes with coordinated write freeze; pending production operator scheduling and acceptance |
| Observation period | 24 hours after smoke acceptance; pending owner acceptance |
| Approval owner | Missing; must be explicitly named |
| Smoke checks | OTP/login notification, manual bookkeeping consistency, text/image processing, retry/edit retry, file preview, delete, Stream/Details/Stats, Settings, credentials/API, authorization, and restart recovery, as listed in `removal-release/release-runbook.md` |
| Stop conditions | Authentication/authorization failure, missing source file, bookkeeping mismatch, duplicate entry, stuck processing, migration/integrity/FK error, elevated locking, unsanitized error, response-contract change, or retained desktop/mobile failure |

Because the approval owner, accepted times, production prior digest, and external client attestation
are missing, task 1.8 remains open. Tasks 2.8 and 4.9 remain open because the repository contains no
explicit approval plus production deployment/acceptance record for either historical release.

## Task Audit Result

| Task | Result | Evidence |
| --- | --- | --- |
| 1.1 | Open | Isolated base/branch recorded; deployed production digest missing |
| 1.3 | Closed | Approved-copy aggregate inventory and accepted anomaly classification above |
| 1.4 | Closed | Existing owner-confirmed coordinated backup plus fresh SQLite/WAL/uploads restore and candidate start/restart; backup identifier remains a later release-gate input |
| 1.6 | Open | Automated baseline exists, but baseline request counts, polling, response sizes, and interaction observations were explicitly deferred |
| 1.7 | Open | Repository surface is known; external client attestation is missing |
| 1.8 | Open | Smoke/stop controls exist; named approver and accepted window/observation times are missing |
| 2.7 | Closed | Removal build, no target schema, base-image rollback against restored copy |
| 2.8 | Open | No explicit approval or production deployment/acceptance record |
| 4.7 | Open | Image start and API write passed; positive authenticated retained business-read smoke is missing |
| 4.8 | Closed | Expand entrypoint, zero-row target schema, no upper target read, compatible write, and image rollback passed |
| 4.9 | Open | No explicit approval, production backup identifier, deployment, or old-behavior acceptance record |

Task 9.1 was not started. Production deployment remains prohibited until every open prerequisite is
closed or explicitly waived by the authorized owner.

## Validation

- `npm run check`: passed ESLint, TypeScript, 141 files / 794 unit tests, 67 files / 341
  integration tests, 208 files / 1,135 coverage tests, the production Next.js build, and two locale
  catalogs. Coverage was 64.31% lines, 63.33% statements, 59.81% functions, and 58.25% branches.
- Historical Docker builds: base `c223d539`, removal `6505c8a1`, and expand `a112a260` passed.
- Docker start/rollback rehearsals: removal-to-base, expand-to-removal, expand-compatible-write to
  removal, and candidate-to-local-prior all returned HTTP 200 after rollback.
- Restored-snapshot smoke: candidate first start and explicit restart returned HTTP 200; excluded
  row/file hashes and zero-target counts were unchanged.
- `openspec validate prepare-production-ready-application-layer --strict`: passed.
- `git diff --check`: passed.
