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
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

const DOMAIN_PREFIX = "credential:v1:";
const MIGRATION_LOCK_ID = 0x43524544; // "CRED"
const PEPPER = process.env.API_KEY_PEPPER;
const DATABASE_URL = process.env.DATABASE_URL;

const MODES = ["backfill", "verify", "clear-plaintext"];
const TRANSIENT_CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

function usage() {
  console.error(
    `Usage: API_KEY_PEPPER=<pepper> DATABASE_URL=<url> node ${new URL(import.meta.url).pathname} <mode> [--allow-plaintext]`
  );
  console.error(`Modes: ${MODES.join(", ")}`);
  console.error("Use --allow-plaintext only with pre-clear verify.");
  process.exit(1);
}

export function computeHash(token) {
  const hmac = crypto.createHmac("sha256", PEPPER);
  hmac.update(DOMAIN_PREFIX);
  hmac.update(token);
  return hmac.digest("hex");
}

export function prefixSuffix(token) {
  return {
    prefix: token.slice(0, 8),
    suffix: token.slice(-4),
  };
}

function isTransientConnectionError(error) {
  return (
    error != null &&
    typeof error === "object" &&
    (TRANSIENT_CONNECTION_CODES.has(error.code) || error.message === "timeout expired")
  );
}

export async function runWithTransientConnectionRetries(operation, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientConnectionError(error) || attempt === maxAttempts) throw error;
      const delayMs = attempt * 500;
      console.warn(
        `[migration] Transient database connection failure (${error.code ?? error.message}); retrying ` +
          `${attempt + 1}/${maxAttempts} in ${delayMs}ms.`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function backfill(client) {
  console.log("[backfill] Starting migration of plaintext service credential tokens...");

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);

    const { rows } = await client.query(
      `SELECT id, key FROM service_credentials
       WHERE key IS NOT NULL
         AND token_hash IS NULL
         AND deleted_at IS NULL
       ORDER BY created_at ASC
       FOR UPDATE`
    );

    if (rows.length === 0) {
      console.log("[backfill] No active credentials to migrate.");
    } else {
      console.log(`[backfill] Found ${rows.length} active credential(s) to migrate.`);

      let migrated = 0;
      for (const row of rows) {
        const hash = computeHash(row.key);
        const { prefix, suffix } = prefixSuffix(row.key);

        const result = await client.query(
          `UPDATE service_credentials
           SET token_hash = $1, token_prefix = $2, token_suffix = $3
           WHERE id = $4 AND token_hash IS NULL`,
          [hash, prefix, suffix, row.id]
        );

        if (result.rowCount === 1) {
          migrated++;
          console.log(`[backfill] Migrated credential ${row.id}`);
        }
      }

      console.log(`[backfill] Done. Migrated ${migrated} active credential(s).`);
    }

    const deletedResult = await client.query(
      `UPDATE service_credentials
       SET key = NULL
       WHERE deleted_at IS NOT NULL AND key IS NOT NULL`
    );

    if (deletedResult.rowCount > 0) {
      console.log(
        `[backfill] Cleared plaintext from ${deletedResult.rowCount} deleted credential(s).`
      );
    } else {
      console.log("[backfill] No deleted credentials with plaintext key to clear.");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function verify(client, { allowPlaintext = false } = {}) {
  console.log("[verify] Verifying all active credentials...");

  const { rows } = await client.query(
    `SELECT id, key, token_hash, token_prefix, token_suffix
     FROM service_credentials
     WHERE deleted_at IS NULL
     ORDER BY created_at ASC`
  );

  let activeTotal = rows.length;
  let invalidActiveCount = 0;

  for (const row of rows) {
    const issues = [];

    if (row.token_hash == null) {
      issues.push("missing token_hash");
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
      invalidActiveCount++;
      console.log(`[verify] FAIL: credential ${row.id}: ${issues.join("; ")}`);
    }
  }

  // Count plaintext keys across ALL rows (active + deleted)
  const { rows: plaintextRows } = await client.query(
    `SELECT COUNT(*) as cnt FROM service_credentials WHERE key IS NOT NULL`
  );
  const plaintextCount = parseInt(plaintextRows[0]?.cnt ?? "0", 10);

  const hasInvalidActive = invalidActiveCount > 0;
  const hasDisallowedPlaintext = !allowPlaintext && plaintextCount > 0;

  console.log(
    `[verify] ${activeTotal} active credential(s) checked, ` +
      `${invalidActiveCount} active invalid, ` +
      `${plaintextCount} row(s) still have plaintext key.`
  );

  if (hasInvalidActive || hasDisallowedPlaintext) {
    throw new Error(
      "[verify] Verification FAILED. " +
        (hasInvalidActive ? `${invalidActiveCount} active credential(s) invalid. ` : "") +
        (hasDisallowedPlaintext ? `${plaintextCount} row(s) still have plaintext key.` : "")
    );
  }

  if (plaintextCount > 0) {
    console.log(
      "[verify] All active credential hashes are valid; plaintext is allowed for this pre-clear check."
    );
  } else {
    console.log("[verify] All credentials valid, no plaintext keys remaining.");
  }
}

export async function clearPlaintext(client) {
  console.log("[clear-plaintext] Verifying all active credentials before clearing plaintext...");

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);

    // First verify all active rows have valid hash/prefix/suffix
    const { rows: verifyRows } = await client.query(
      `SELECT id, key, token_hash, token_prefix, token_suffix
       FROM service_credentials
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC
       FOR UPDATE`
    );

    for (const row of verifyRows) {
      if (row.token_hash == null) {
        throw new Error(
          `[clear-plaintext] REFUSING: credential ${row.id} has no token_hash. Run backfill first.`
        );
      }
      if (row.token_prefix == null || row.token_suffix == null) {
        throw new Error(
          `[clear-plaintext] REFUSING: credential ${row.id} is missing prefix or suffix. Run backfill first.`
        );
      }
      // If key exists, verify hash matches
      if (row.key != null) {
        const expectedHash = computeHash(row.key);
        if (expectedHash !== row.token_hash) {
          throw new Error(
            `[clear-plaintext] REFUSING: credential ${row.id} hash mismatch. Run backfill first.`
          );
        }
      }
    }

    console.log(
      "[clear-plaintext] All active credentials validated. Clearing plaintext key column..."
    );

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
    const detail = parts.length > 0 ? `${parts.join(" + ")} credential(s)` : "0 credentials";
    console.log(`[clear-plaintext] Cleared ${detail} (${totalCleared} total).`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
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

  const allowPlaintext = process.argv.includes("--allow-plaintext");
  if (allowPlaintext && mode !== "verify") {
    console.error("Error: --allow-plaintext is only valid with verify.");
    usage();
  }

  await runWithTransientConnectionRetries(async () => {
    const client = new Client({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
    });
    try {
      await client.connect();
      switch (mode) {
        case "backfill":
          await backfill(client);
          break;
        case "verify":
          await verify(client, { allowPlaintext });
          break;
        case "clear-plaintext":
          await clearPlaintext(client);
          break;
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  });

  console.log(`[${mode}] Completed successfully.`);
}

if (process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Fatal error:`, error);
    process.exit(1);
  });
}
