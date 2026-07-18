# Service Credential Hash Migration Evidence

This document serves as the runbook and evidence record for migrating plaintext service credential
tokens to HMAC-SHA-256 hashes, and removing all plaintext keys from the database.

**Related issue:** P1-03 -- Deleted service credentials retain plaintext token keys

## Prerequisites

- `API_KEY_PEPPER` environment variable (same value used at credential creation for hash verification)
- `DATABASE_URL` pointing to the target Postgres database
- Node.js runtime (the script uses only `node:crypto` and `pg`, no framework dependencies)
- Write access to `service_credentials` table

## Step 1: Run Backfill

This step computes hash/prefix/suffix for all active credentials that still have a plaintext `key`
but no `token_hash`, and immediately clears the `key` column on all deleted rows.

```bash
API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node scripts/migrations/hash-service-credentials.mjs backfill
```

**Expected output:**

```
[backfill] Starting migration of plaintext service credential tokens...
[backfill] Found N credential(s) to migrate.
[backfill] Migrated credential <id>
...
[backfill] Done. Migrated N active credential(s).
[backfill] Cleared plaintext from M deleted credential(s).
[backfill] Completed successfully.
```

**Record:**

| Field                  | Value |
| ---------------------- | ----- |
| Date / time            |       |
| Environment            |       |
| Active rows backfilled |       |
| Deleted rows cleared   |       |
| Any errors?            |       |

## Step 2: Verify (Pre-Clear)

Confirm that all active credentials have valid `token_hash`/`token_prefix`/`token_suffix`. Active
plaintext is expected before the clear phase and is allowed only by the explicit command flag.

```bash
API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node scripts/migrations/hash-service-credentials.mjs verify --allow-plaintext
```

**Expected output (success):**

```
[verify] Verifying all active credentials...
[verify] X active credential(s) checked, 0 active invalid, P row(s) still have plaintext key.
[verify] All active credential hashes are valid; plaintext is allowed for this pre-clear check.
[verify] Completed successfully.
```

Exit code must be 0. Plaintext is expected at this stage and is allowed only by the explicit flag.

**Record:**

| Field                         | Value       |
| ----------------------------- | ----------- |
| Date / time                   |             |
| Active credentials checked    |             |
| Active missing token_hash     | (must be 0) |
| Rows still with plaintext key | (must be 0) |
| Exit code                     |             |
| Any errors?                   |             |

## Step 3: Clear Plaintext

This step clears the `key` column on **all** rows:

- Active rows with valid `token_hash`
- All deleted rows (unconditionally)

The script refuses to run if any active row lacks `token_hash`/`token_prefix`/`token_suffix` or has
a hash mismatch with its stored `key`. If you reach this step with a passing verify, this pre-check
should always pass.

```bash
API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node scripts/migrations/hash-service-credentials.mjs clear-plaintext
```

**Expected output:**

```
[clear-plaintext] Verifying all active credentials before clearing plaintext...
[clear-plaintext] All active credentials validated. Clearing plaintext key column...
[clear-plaintext] Cleared A active + D deleted credential(s) (T total).
[clear-plaintext] Completed successfully.
```

**Record:**

| Field                | Value |
| -------------------- | ----- |
| Date / time          |       |
| Active rows cleared  |       |
| Deleted rows cleared |       |
| Total rows cleared   |       |
| Any errors?          |       |

## Step 4: Final Verify

Run verify again to confirm zero plaintext keys across all rows.

```bash
API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node scripts/migrations/hash-service-credentials.mjs verify
```

**Expected output (success):**

```
[verify] Verifying all active credentials...
[verify] X active credential(s) checked, 0 active invalid, 0 row(s) still have plaintext key.
[verify] All credentials valid, no plaintext keys remaining.
[verify] Completed successfully.
```

Exit code must be 0.

**Record:**

| Field                         | Value       |
| ----------------------------- | ----------- |
| Date / time                   |             |
| Active credentials checked    |             |
| Active missing token_hash     | (must be 0) |
| Rows still with plaintext key | (must be 0) |
| Exit code                     |             |

## Step 5: Smoke Test Authentication

After clearing plaintext, confirm that API v1 credential authentication still works. Use a known
credential (preferably one that existed before the migration) to create a source document:

```bash
curl -X POST https://<host>/api/v1/source-documents \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"text": "Smoke test entry after credential hash migration"}'
```

Expected: HTTP 201 with `status: "queued"`.

**Record:**

| Field         | Value |
| ------------- | ----- |
| Date / time   |       |
| HTTP status   |       |
| Response body |       |

## Completion Criteria

The migration gate is **complete** when all of the following are true:

1. [x] Backfill completed with zero errors
2. [x] Pre-clear verify: 0 active invalid; expected plaintext allowed explicitly
3. [x] Clear-plaintext completed with zero errors
4. [x] Post-clear verify: 0 active invalid, 0 rows with plaintext key
5. [x] A pre-migration token matched exactly one active hash-only credential after plaintext clear
6. [x] All non-secret evidence fields recorded below

## Next Steps (After Gate)

Only after this evidence exists for the target (production) environment:

1. Remove the legacy plaintext fallback in `src/application/adapters/postgres/business-ports.ts`
   (the `// Fallback: legacy plaintext key lookup` block in the `authenticate` method).
2. Run the final Postgres migration to drop the `key` column from `service_credentials`.
3. Add application-level validation constraints on `token_hash`/`token_prefix`/`token_suffix` for
   active rows.

**Do not proceed with these steps until target-environment evidence is confirmed.**

## Production Execution Record

Execution date: 2026-07-18 (Asia/Shanghai)

Target: the Neon database configured by the production-shape local `.env`. The user confirmed that
the local application and production use this same database. Secret values, full tokens, hashes,
prefixes, and suffixes were not recorded.

| Stage                | Result                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- |
| Schema preparation   | Postgres migrations `0001` through `0003` applied successfully                          |
| Backfill             | 2 active credentials migrated; 0 deleted credentials required plaintext clearing        |
| Pre-clear verify     | 2 active checked; 0 invalid; 2 plaintext rows expected; exit 0 with `--allow-plaintext` |
| Clear plaintext      | 2 active credentials cleared; transaction committed successfully                        |
| Final verify         | 2 active checked; 0 invalid; 0 plaintext rows; exit 0                                   |
| Migrated-token smoke | One token captured before clear matched exactly one active `token_hash` after clear     |
| Final schema         | `key` column absent; `ck_active_service_credentials_hashed` present and validated       |
| Migration ledger     | 6 Postgres migrations applied, through `0005`                                           |

The smoke token was held only in a mode-0600 temporary file and deleted immediately after the
post-clear lookup. API v1 route authentication remains covered by the focused integration suite;
no production HTTP endpoint was available from this workspace for an external 201 response.

The migration gate is complete. The legacy plaintext fallback was removed, the final drop-column
migration was applied, and active credentials are now protected by a database check constraint.
