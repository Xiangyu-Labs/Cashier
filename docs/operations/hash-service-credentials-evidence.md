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

| Field                     | Value                                  |
|---------------------------|----------------------------------------|
| Date / time               |                                        |
| Environment               |                                        |
| Active rows backfilled    |                                        |
| Deleted rows cleared      |                                        |
| Any errors?               |                                        |

## Step 2: Verify (Pre-Clear)

Confirm that all active credentials have valid `token_hash`/`token_prefix`/`token_suffix` and that
no row anywhere retains a plaintext key.

```bash
API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node scripts/migrations/hash-service-credentials.mjs verify
```

**Expected output (success):**
```
[verify] Verifying all active credentials...
[verify] X active credential(s) checked, 0 active missing token_hash, 0 row(s) still have plaintext key.
[verify] All credentials valid, no plaintext keys remaining.
[verify] Completed successfully.
```

Exit code must be 0. If the script exits with code 1, investigate and re-run backfill.

**Record:**

| Field                         | Value                                  |
|-------------------------------|----------------------------------------|
| Date / time                   |                                        |
| Active credentials checked    |                                        |
| Active missing token_hash     |                                        (must be 0) |
| Rows still with plaintext key |                                        (must be 0) |
| Exit code                     |                                        |
| Any errors?                   |                                        |

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

| Field                     | Value                                  |
|---------------------------|----------------------------------------|
| Date / time               |                                        |
| Active rows cleared       |                                        |
| Deleted rows cleared      |                                        |
| Total rows cleared        |                                        |
| Any errors?               |                                        |

## Step 4: Final Verify

Run verify again to confirm zero plaintext keys across all rows.

```bash
API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node scripts/migrations/hash-service-credentials.mjs verify
```

**Expected output (success):**
```
[verify] Verifying all active credentials...
[verify] X active credential(s) checked, 0 active missing token_hash, 0 row(s) still have plaintext key.
[verify] All credentials valid, no plaintext keys remaining.
[verify] Completed successfully.
```

Exit code must be 0.

**Record:**

| Field                         | Value                                  |
|-------------------------------|----------------------------------------|
| Date / time                   |                                        |
| Active credentials checked    |                                        |
| Active missing token_hash     |                                        (must be 0) |
| Rows still with plaintext key |                                        (must be 0) |
| Exit code                     |                                        |

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

| Field            | Value                                  |
|------------------|----------------------------------------|
| Date / time      |                                        |
| HTTP status      |                                        |
| Response body    |                                        |

## Completion Criteria

The migration gate is **complete** when all of the following are true:

1. [ ] Backfill completed with zero errors
2. [ ] Pre-clear verify: 0 active missing token_hash, 0 rows with plaintext key
3. [ ] Clear-plaintext completed with zero errors
4. [ ] Post-clear verify: 0 active missing token_hash, 0 rows with plaintext key
5. [ ] Smoke test passed (API v1 token authentication)
6. [ ] All evidence fields recorded above

## Next Steps (After Gate)

Only after this evidence exists for the target (production) environment:

1. Remove the legacy plaintext fallback in `src/application/adapters/postgres/business-ports.ts`
   (the `// Fallback: legacy plaintext key lookup` block in the `authenticate` method).
2. Run the final Postgres migration to drop the `key` column from `service_credentials`.
3. Add application-level validation constraints on `token_hash`/`token_prefix`/`token_suffix` for
   active rows.

**Do not proceed with these steps until target-environment evidence is confirmed.**
