# Application-Layer Backfill Rehearsal

Date: 2026-07-14

Scope: approved production SQLite/upload copy in `data/`. No production database or upload volume was
connected. The rehearsal did not delete, move, copy, or rewrite any upload.

## Rehearsal Result

The approved-copy rehearsal completed seven bounded transactions. The immediate repeat completed zero
transactions and reconciliation stayed at zero unresolved differences. The temporary standalone backfill
command used for that rehearsal has been removed; it is not a production operation.

## Accepted Mapping

- 987 legacy source documents were inspected.
- 653 non-deleted documents received one deterministic initial revision each.
- 632 stored-file and revision-file relationships were created from existing local files; their bytes were
  read only to calculate trusted metadata and were not changed.
- 943 revision-entry and ledger-projection relationships were created.
- 334 deleted source documents were deliberately excluded from target projections at the owner's direction.
  Their legacy rows, ledger entries, image URLs, and IDs remain unchanged for rollback evidence.
- Two active inline `data:image` references were registered as `legacy-inline` metadata-only stored files.
  Their encoded source bytes remain in the legacy source-document row; no image object was created or changed.

## Legacy Differences

- 112 external image references and four missing local-file references belong only to deleted source documents.
  They are retained in legacy data and do not create target references because deleted source documents are
  excluded by the accepted mapping.
- The post-run inventory remains SQLite `quick_check: ok` with zero foreign-key violations.
- Reconciliation reported zero unresolved target differences. A rerun created no additional revisions,
  stored files, revision files, revision entries, or ledger projections.

## Production Migration Decision

The owner approved the production backfill on 2026-07-14 and confirmed that the coordinated backup was
complete. Because concurrent-write lock contention was not measured, deployment still uses the existing
container replacement as the write boundary: the prior application container must be stopped before the new
container starts its migration.

The backfill is now an internal database migration. `docker-entrypoint.sh` invokes `npm run db:migrate`, which
runs the Drizzle SQL migration chain and then the application-layer backfill before `server.js` starts. There
is no separate apply or approval flag. A source-data blocker or any reconciliation difference exits nonzero
and prevents the application from starting.

The migration determines resume work from incomplete target mappings rather than the old lexicographic
cursor. A normal restart performs zero backfill writes, while an eligible legacy document created between
releases is picked up even if its ID sorts before the previous cursor.

## Automatic Migration Verification

The approved local data set had advanced since the rehearsal. The new `db:migrate` path completed seven
batches for 656 eligible non-deleted documents and reconciled 656 revisions, 635 stored-file/revision-file
relationships, and 946 revision-entry/ledger projections. The 334 deleted documents still have zero target
revision rows. SQLite reported `quick_check: ok` and zero foreign-key violations.

An immediate second `db:migrate` run reported zero batches, zero applied documents, and zero unresolved
differences. No task in group 6 was started.

## Docker Runtime Verification

Docker 29.6.1 was used to build the production image successfully. The verified local image digest was
`sha256:7044f9e3b74dd439b2de5f3bda4bea937be7f574f2ba9075d6e68129610a8a9c`.
The build runs migrations against an isolated `/tmp` SQLite database before `next build`, which prevents
parallel page-data workers from racing while changing a new database to WAL mode. The runtime image prepares
`/app/data/uploads` for the non-root `node` user so an empty data volume can be initialized safely.

An isolated Docker volume verified all of the following:

- The runtime image contains the SQL migrations, migration runner, internal backfill, and executable entrypoint.
- First and repeated `db:migrate` container runs completed with zero unresolved differences; the repeat made
  zero backfill writes.
- The real entrypoint completed migrations, started the Next.js production server, and returned HTTP 200 for
  `/en/login`.
- The migrated database had 36 Drizzle migration records, one completed backfill checkpoint,
  `quick_check: ok`, and zero foreign-key violations.
- A separate volume containing malformed legacy image metadata made the real entrypoint exit with status 1
  during migration, before the application start command.

All verification containers, volumes, and the temporary local image tag were removed after the checks.
