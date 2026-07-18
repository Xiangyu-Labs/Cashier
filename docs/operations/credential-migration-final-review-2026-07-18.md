# Credential Migration Final Review

Date: 2026-07-18

Scope: final review and production execution of the service credential plaintext-to-HMAC migration.

## Findings

### 1. Verify could return success for invalid active credentials

The script logged missing prefix/suffix and hash mismatch issues but only used the missing-hash count
to determine its exit status. An active row with an invalid hash or missing display metadata could
therefore produce a visible `FAIL` line and still exit successfully.

Resolution: verification now counts every active row with any issue as invalid and fails when the
count is non-zero. Focused tests cover missing metadata and hash mismatch.

### 2. The documented pre-clear verification sequence was impossible

Backfill intentionally retained active plaintext until the clear phase, while the original `verify`
command rejected any remaining plaintext. The documented `backfill -> verify -> clear` sequence
could not produce a successful pre-clear verification.

Resolution: pre-clear verification now requires the explicit `--allow-plaintext` flag. It still
requires every active hash/prefix/suffix to be valid. Final verification does not use the flag and
requires zero plaintext rows.

### 3. Transaction locking evidence did not match the code

Operations documentation stated that the clear phase used an advisory lock, but the implementation
only opened a transaction. Concurrent migration processes were not serialized, and selected active
rows were not locked.

Resolution: backfill and clear now acquire the same transaction-scoped Postgres advisory lock and
select active rows `FOR UPDATE` before mutation.

### 4. Neon connection failures made the operational script unreliable

The target Neon endpoint intermittently reset or timed out during TLS connection establishment.
Manual reruns were safe because the migration is idempotent, but the CLI did not distinguish these
transient connection failures from validation failures.

Resolution: each attempt now uses a fresh single `pg.Client`, has a 15-second connection timeout,
and retries only recognized transient connection errors up to five times. SQL and validation errors
are never retried.

### 5. Generated migration metadata could skip or duplicate the final migration

Hand-authored `0002` and `0003` migrations had future timestamps and no matching snapshots. Initial
generation of `0004` repeated their SQL, and its generated timestamp sorted before them, which could
cause the migrator to skip it.

Resolution: `0004` and `0005` have monotonic timestamps after `0003`. The final migrations first
validate the active-hash constraint, then drop `key`; the follow-up constraint statement is
idempotent. A clean database migration rehearsal applied all six migrations and confirmed that the
column is absent and the constraint is present.

## Final Assessment

No blocking credential migration issue remains. The target database contains two active hash-only
credentials, no plaintext column, and a validated constraint preventing active incomplete rows.
Browser acceptance remains the only open overall product acceptance item and is unrelated to this
database security migration.
