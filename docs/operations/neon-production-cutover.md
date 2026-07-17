# Neon Production Cutover

The application runtime is PostgreSQL-only. Images remain on the local filesystem under
`LOCAL_STORAGE_PATH`. Database migrations and the SQLite import are explicit maintenance-window
operations; the application container does not run either operation at startup.

## Before The Window

1. Build and test the exact commit that will be released.
2. Confirm the Neon pooled URL is available for `DATABASE_URL`.
3. Confirm `.env.neon.local` contains `NEON_DATABASE_URL` or set a direct
   `DATABASE_MIGRATION_URL` for the migration commands.
4. Run the read-only source preflight:

   ```sh
   npm run db:migrate:neon
   ```

5. Confirm the reported missing-file count is zero and record the source fingerprint and counts.

## Maintenance Window

1. Stop the production application so SQLite receives no further writes.
2. Copy `sqlite.db`, `sqlite.db-wal`, `sqlite.db-shm`, and the complete uploads directory to the
   release workspace. Do not copy a live SQLite database without its WAL/SHM files.
3. Point `--source` and `--uploads` at that final copy and repeat the dry-run:

   ```sh
   npm run db:migrate:neon -- --source /path/to/sqlite.db --uploads /path/to/uploads
   ```

4. Apply the PostgreSQL schema, then transactionally replace and reconcile the Neon `public` data:

   ```sh
   npm run db:migrate
   npm run db:migrate:neon -- --apply --approved-production-stop \
     --source /path/to/sqlite.db --uploads /path/to/uploads
   ```

5. Do not continue unless `mismatchCount`, `deletedTargetDocuments`, and
   `danglingRevisionPointers` are all zero. Deleted source documents are intentionally excluded.
6. Change production `DATABASE_URL` to the Neon pooled URL. Keep `LOCAL_STORAGE_PATH` and the
   uploads volume unchanged.
7. Deploy the tested image and verify startup, authentication, source-document lists/details,
   ledger lists/stats, one new write, and one image read.
8. Reopen traffic.

## Rollback

Before reopening traffic, rollback is: stop the candidate, restore the previous image and SQLite
`DATABASE_URL`, restore the coordinated SQLite/uploads copy if any candidate writes occurred, then
start the previous image. After traffic has reopened and PostgreSQL has accepted writes, rollback
requires a separately approved reverse-data migration; do not point the old image at a stale
SQLite file.
