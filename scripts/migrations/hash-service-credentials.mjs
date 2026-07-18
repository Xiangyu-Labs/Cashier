#!/usr/bin/env node

/**
 * Hash Service Credentials Migration
 *
 * One-time script to backfill existing plaintext service credential tokens into
 * their HMAC-SHA-256 hashes, verify correctness, and clear plaintext columns.
 *
 * Modes:
 *   backfill         - Hash all active credentials that have key but no token_hash,
 *                       then clear key on deleted rows.
 *   verify           - Verify all active credentials have valid hash/prefix/suffix,
 *                       and report total plaintext key count across all rows.
 *   clear-plaintext  - Set key column to NULL for all rows (active with valid hash,
 *                       and all deleted rows).
 *
 * Usage:
 *   API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node scripts/migrations/hash-service-credentials.mjs <mode>
 *
 * The script is resumable: re-running `backfill` only affects rows that still
 * need migration. Rerunning `verify` re-verifies everything.
 */

import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const DOMAIN_PREFIX = "credential:v1:";
const PEPPER = process.env.API_KEY_PEPPER;
const DATABASE_URL = process.env.DATABASE_URL;

const MODES = ["backfill", "verify", "clear-plaintext"];

function usage() {
  console.error(`Usage: API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node ${new URL(import.meta.url).pathname} <mode>`);
  console.error(`Modes: ${MODES.join(", ")}`);
  process.exit(1);
}

function computeHash(token) {
  const hmac = crypto.createHmac("sha256", PEPPER);
  hmac.update(DOMAIN_PREFIX);
  hmac.update(token);
  return hmac.digest("hex");
}

function prefixSuffix(token) {
  return {
    prefix: token.slice(0, 8),
    suffix: token.slice(-4),
  };
}

async function backfill(pool) {
  console.log("[backfill] Starting migration of plaintext service credential tokens...");

  const { rows } = await pool.query(
    `SELECT id, key FROM service_credentials
     WHERE key IS NOT NULL
       AND token_hash IS NULL
       AND deleted_at IS NULL
     ORDER BY created_at ASC`
  );

  if (rows.length === 0) {
    console.log("[backfill] No active credentials to migrate.");
  } else {
    console.log(`[backfill] Found ${rows.length} active credential(s) to migrate.`);

    let migrated = 0;
    for (const row of rows) {
      const hash = computeHash(row.key);
      const { prefix, suffix } = prefixSuffix(row.key);

      await pool.query(
        `UPDATE service_credentials
         SET token_hash = $1, token_prefix = $2, token_suffix = $3
         WHERE id = $4 AND token_hash IS NULL`,
        [hash, prefix, suffix, row.id]
      );

      migrated++;
      console.log(`[backfill] Migrated credential ${row.id}`);
    }

    console.log(`[backfill] Done. Migrated ${migrated} active credential(s).`);
  }

  // Clear plaintext key from deleted rows (they don't need hashing)
  const deletedResult = await pool.query(
    `UPDATE service_credentials
     SET key = NULL
     WHERE deleted_at IS NOT NULL AND key IS NOT NULL`
  );

  if (deletedResult.rowCount > 0) {
    console.log(`[backfill] Cleared plaintext from ${deletedResult.rowCount} deleted credential(s).`);
  } else {
    console.log("[backfill] No deleted credentials with plaintext key to clear.");
  }
}

async function verify(pool) {
  console.log("[verify] Verifying all active credentials...");

  const { rows } = await pool.query(
    `SELECT id, key, token_hash, token_prefix, token_suffix
     FROM service_credentials
     WHERE deleted_at IS NULL
     ORDER BY created_at ASC`
  );

  let activeTotal = rows.length;
  let missingHashCount = 0;

  for (const row of rows) {
    const issues = [];

    if (row.token_hash == null) {
      issues.push("missing token_hash");
      missingHashCount++;
    }

    if (row.token_prefix == null) {
      issues.push("missing token_prefix");
    }

    if (row.token_suffix == null) {
      issues.push("missing token_suffix");
    }

    // If we have a key but also a hash, verify the hash matches
    if (row.key != null && row.token_hash != null) {
      const expectedHash = computeHash(row.key);
      if (expectedHash !== row.token_hash) {
        issues.push("hash mismatch: stored hash does not match computed hash of key");
      }
    }

    // If we have a key, verify prefix/suffix match
    if (row.key != null && row.token_prefix != null && row.token_suffix != null) {
      const { prefix, suffix } = prefixSuffix(row.key);
      if (prefix !== row.token_prefix) {
        issues.push("prefix mismatch");
      }
      if (suffix !== row.token_suffix) {
        issues.push("suffix mismatch");
      }
    }

    if (issues.length > 0) {
      console.log(`[verify] FAIL: credential ${row.id}: ${issues.join("; ")}`);
    }
  }

  // Count plaintext keys across ALL rows (active + deleted)
  const { rows: plaintextRows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM service_credentials WHERE key IS NOT NULL`
  );
  const plaintextCount = parseInt(plaintextRows[0]?.cnt ?? "0", 10);

  const hasActiveMissing = missingHashCount > 0;
  const hasPlaintext = plaintextCount > 0;

  console.log(
    `[verify] ${activeTotal} active credential(s) checked, ` +
    `${missingHashCount} active missing token_hash, ` +
    `${plaintextCount} row(s) still have plaintext key.`
  );

  if (hasActiveMissing || hasPlaintext) {
    console.error("[verify] Verification FAILED. " +
      (hasActiveMissing ? `${missingHashCount} active credential(s) missing token_hash. ` : "") +
      (hasPlaintext ? `${plaintextCount} row(s) still have plaintext key.` : "")
    );
    process.exit(1);
  }

  console.log("[verify] All credentials valid, no plaintext keys remaining.");
}

async function clearPlaintext(pool) {
  console.log("[clear-plaintext] Verifying all active credentials before clearing plaintext...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // First verify all active rows have valid hash/prefix/suffix
    const { rows: verifyRows } = await client.query(
      `SELECT id, key, token_hash, token_prefix, token_suffix
       FROM service_credentials
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC`
    );

    for (const row of verifyRows) {
      if (row.token_hash == null) {
        console.error(`[clear-plaintext] REFUSING: credential ${row.id} has no token_hash. Run backfill first.`);
        await client.query("ROLLBACK");
        process.exit(1);
      }
      if (row.token_prefix == null || row.token_suffix == null) {
        console.error(`[clear-plaintext] REFUSING: credential ${row.id} is missing prefix or suffix. Run backfill first.`);
        await client.query("ROLLBACK");
        process.exit(1);
      }
      // If key exists, verify hash matches
      if (row.key != null) {
        const expectedHash = computeHash(row.key);
        if (expectedHash !== row.token_hash) {
          console.error(`[clear-plaintext] REFUSING: credential ${row.id} hash mismatch. Run backfill first.`);
          await client.query("ROLLBACK");
          process.exit(1);
        }
      }
    }

    console.log("[clear-plaintext] All active credentials validated. Clearing plaintext key column...");

    // Clear key on active rows with valid hash
    const activeResult = await client.query(
      `UPDATE service_credentials
       SET key = NULL
       WHERE key IS NOT NULL
         AND token_hash IS NOT NULL
         AND deleted_at IS NULL`
    );
    const activeCleared = activeResult.rowCount ?? 0;

    // Clear key on all deleted rows unconditionally
    const deletedResult = await client.query(
      `UPDATE service_credentials
       SET key = NULL
       WHERE key IS NOT NULL
         AND deleted_at IS NOT NULL`
    );
    const deletedCleared = deletedResult.rowCount ?? 0;

    await client.query("COMMIT");

    const totalCleared = activeCleared + deletedCleared;
    const parts = [];
    if (activeCleared > 0) parts.push(`${activeCleared} active`);
    if (deletedCleared > 0) parts.push(`${deletedCleared} deleted`);
    console.log(`[clear-plaintext] Cleared ${parts.join(" + ")} credential(s) (${totalCleared} total).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (!PEPPER) {
    console.error("Error: API_KEY_PEPPER environment variable is required.");
    usage();
  }

  if (!DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is required.");
    usage();
  }

  const mode = process.argv[2];
  if (!mode || !MODES.includes(mode)) {
    console.error(`Error: Invalid mode "${mode}". Must be one of: ${MODES.join(", ")}`);
    usage();
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

  try {
    switch (mode) {
      case "backfill":
        await backfill(pool);
        break;
      case "verify":
        await verify(pool);
        break;
      case "clear-plaintext":
        await clearPlaintext(pool);
        break;
    }
  } finally {
    await pool.end();
  }

  console.log(`[${mode}] Completed successfully.`);
}

main().catch((error) => {
  console.error(`Fatal error:`, error);
  process.exit(1);
});
