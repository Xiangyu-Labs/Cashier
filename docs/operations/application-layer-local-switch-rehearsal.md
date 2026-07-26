# Application-Layer Local Switch Rehearsal

Date: 2026-07-17

Scope: OpenSpec tasks 9.1 through 9.8 for
`prepare-production-ready-application-layer`. This was a local-only rehearsal against a coordinated
copy of `data/sqlite.db`, its WAL/SHM state, and `data/uploads`. It did not connect to production or
any managed provider, deploy, push, or require browser/manual acceptance.

## Release Inputs And Compatibility Behavior

| Input                 | Recorded value                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Candidate             | Current workspace at `bfb63420502f84c87988d38e0c320da055ad5a4e`, including the uncommitted WAL/backfill fixes                        |
| Candidate image       | `sha256:4f0227152df9b1bffe39a6e1629fee7e6b3afc648905ab1466dcdaadb67b5cba`                                                            |
| Prior-image baseline  | `origin/main` at `4db249af8494b65cfb339082440c294a832c087b`                                                                          |
| Prior image           | `sha256:279ea7e2e79725c5080902282e6298b65c406d0c99a5a9d1896e8399d3d1c145`                                                            |
| Schema/backfill input | Fresh coordinated local copy of SQLite, present WAL/SHM, and all uploads                                                             |
| Migration path        | Real `./docker-entrypoint.sh`: Drizzle migrations, application-layer backfill, zero-difference reconciliation, then `node server.js` |
| Compatibility window  | API v1 keeps deprecated `status`; target writes retain the minimum legacy `source_documents` projection needed by the prior image    |

The candidate built from the working tree and the prior image built from a read-only `git archive`
of `origin/main`. Both production Docker builds passed. The candidate used a local-only OpenAI base
URL at the container loopback discard port and no email key, so the rehearsal could not connect to
AI, email, production, or a managed provider.

## Pre-Switch Drain And Backup

The rehearsal inserted representative legacy `pending`, `running`, and `completed` task rows into
the copied database. Together with the existing local-copy state, the drain saw one pending, eight
running, and terminal completed/failed/cancelled populations. Dispatch was paused, all nine
non-terminal legacy rows were moved to `cancelled`, and the remaining ambiguous task count was zero.

The drained pre-switch copy is retained locally at:

```text
/tmp/cashier-task9-preswitch-20260717
```

`ops:verify-backup` verified 986 files and 177,250,073 bytes, including 983 upload files and all
database files. SQLite `quick_check` was `ok`, foreign-key violations were zero, and the source copy
contained 991 source documents. The four missing local references were the already accepted
excluded-deleted references; no live container missing-file error occurred.

## Switch, Rollback, And Roll-Forward

The repeatable command was:

```bash
npm run ops:rehearse-switch -- \
  --candidate-image cashier:task9-candidate \
  --prior-image cashier:task9-prior-origin-main \
  --backup /tmp/cashier-task9-preswitch-20260717 \
  --report /tmp/cashier-task9-report.json \
  --port 3219
```

The candidate entrypoint logged migration completion before application start and reported
`unresolvedCount: 0`. Login smoke returned HTTP 200. An authenticated API v1 compatibility write
returned HTTP 201 with target `sourceDocumentId`, `revisionId`, `revisionState`, and deprecated
`status` fields.

The exact local rollback image command exercised by the driver was equivalent to:

```bash
docker rm --force cashier-task9-candidate
docker run --detach --name cashier-task9-prior \
  --publish 127.0.0.1:3219:3000 \
  --volume <rehearsal-copy>:/app/data \
  --env DATABASE_URL=file:/app/data/sqlite.db \
  --env LOCAL_STORAGE_PATH=/app/data/uploads \
  --env SKIP_MIGRATIONS=true \
  sha256:279ea7e2e79725c5080902282e6298b65c406d0c99a5a9d1896e8399d3d1c145
```

The prior image started against the same copied data, returned HTTP 200, and used its own runtime
and `better-sqlite3` dependency to read the candidate-created legacy source-document projection.
The owner, text, state, and empty image list were readable without target-only assumptions.

The candidate then started again through the real entrypoint and returned HTTP 200. Roll-forward
and an explicit migration rerun both reported zero backfill batches and `unresolvedCount: 0`. An
explicit container restart also returned HTTP 200, with zero duplicate ledger projections.

## Automated Smoke

The focused group-9 smoke passed `21 files / 115 tests`:

| Surface                  | Automated coverage                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Authentication           | OTP sign-in and sanitized unauthenticated API response                                            |
| Manual entry             | Quick entry and target upper-workflow tests                                                       |
| Text/image submission    | Source-document submission integration and upload-controller unit tests                           |
| Processing               | Durable dispatcher, restart, duplicate dispatch, and target workflow tests                        |
| Retry/edit retry         | API retry, revision retry, stale completion, and active-result preservation                       |
| Authorized file read     | Stored-file route ownership and cross-owner denial                                                |
| Stream / Details / Stats | Target upper workflows and ledger Stats integration                                               |
| Settings                 | Settings/currency target workflow and settings authorization contracts                            |
| Category/currency        | Entry-category and currency API integration                                                       |
| Service credentials      | Create, authenticate, last-use, ingest, revoke, and denial integration                            |
| API v1                   | Authentication, concurrent idempotency, target fields, deprecated `status`, and bounded responses |
| Sensitive responses      | Live unauthenticated response scan plus error/contract suites                                     |

The live candidate returned the bounded `UNAUTHENTICATED` error once. Its response contained no
SQLite detail, `/app/` path, storage key, prompt, OpenAI material, stack trace, or credential value.

## Reconciliation

After switch, rollback, roll-forward, and restart:

- application-layer reconciliation reported `unresolvedCount: 0`;
- target/legacy compatibility owner and submitted text matched for the representative write;
- active/pending pointer and revision ownership mismatch counts were zero;
- amount, currency, category, timestamp, state, file, and projection mappings passed the backfill
  reconciliation and focused bookkeeping suites;
- one representative local-only processing request remained correctly pending/processing at the
  five-second measurement boundary; restart recovery and terminal outcome behavior passed the
  dispatcher contracts;
- all 635 target stored-file relationships were decoded with `sharp`: 633 local files and two
  legacy-inline JPEGs had matching path boundaries, byte counts, SHA-256 checksums, formats, and
  dimensions, with zero parse failures;
- all 334 excluded deleted documents still had zero target revisions, pointers, or projections;
- excluded source-row SHA-256 remained
  `7cbd898f4008f0d6664329bb90dded31f86c4cb1fc6ff6e1573ccf268def66c5`;
- excluded legacy ledger-row SHA-256 remained
  `d59a68392fed661b91e35fde71e8dbe3eba56da2885294f1f8a93a12315fb2be`;
- the rehearsal upload hash remained
  `0395382c6bdfc27e116e3d1f6c633b77d6d272d0803f3b7af5abc0e575b65b74`;
- SQLite `integrity_check` was `ok` and foreign-key violations were zero.

## Local Runtime Metrics

| Metric                                     | Result               |
| ------------------------------------------ | -------------------- |
| SQLite locking/busy errors                 | 0                    |
| Recoverable pending processing             | 1                    |
| Processing age at measurement              | 5 seconds            |
| Live missing-file errors                   | 0                    |
| Unexpected request failures                | 0                    |
| Candidate startup latency                  | 185.46 ms            |
| Candidate compatibility-write latency      | 26.69 ms             |
| Prior-image startup latency                | 158.15 ms            |
| Roll-forward startup latency               | 287.72 ms            |
| Restart response latency                   | 164.62 ms            |
| Sanitized error-code frequency             | `UNAUTHENTICATED`: 1 |
| Duplicate ledger projections after restart | 0                    |

These are local single-run measurements, not production service-level evidence.

## Rollback Triggers And Acceptance

Rollback is mandatory for any migration/backfill difference, nonzero `unresolvedCount`, SQLite
integrity or foreign-key failure, authorization regression, missing active file, compatibility read
failure, bookkeeping/projection mismatch, ambiguous legacy task state, stuck processing outside the
tested recovery contract, duplicate projection, unsanitized response, or failed HTTP/automated
smoke. The image-only rollback above is used while compatibility invariants hold; otherwise the
coordinated pre-switch data/file copy is restored before the prior image starts.

No rollback trigger fired. The complete `npm run check` passed 141 files / 794 unit tests, 67 files
/ 341 integration tests, 208 files / 1,135 coverage tests, the production Next.js build, and two
locale catalogs. The local candidate is accepted, subject only to the non-behavioral strict
OpenSpec and `git diff --check` handoff checks. No observation window, browser check, screenshot,
manual confirmation, production approval, or production evidence is required.
