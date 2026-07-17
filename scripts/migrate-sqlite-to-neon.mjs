#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import pg from "pg";

const { Client } = pg;
const DEFAULT_SOURCE = "./data/sqlite.db";
const DEFAULT_UPLOADS = "./data/uploads";
const BATCH_SIZE = 100;

const timestampColumns = new Set([
  "email_verified", "created_at", "updated_at", "deleted_at", "expires", "locked_until",
  "last_attempt_at", "verified_at", "last_used_at", "submitted_at", "finalized_at",
  "started_at", "completed_at", "available_at", "claimed_at", "claim_expires_at",
]);
const jsonColumns = new Set(["metadata", "image_urls", "rates", "result", "payload"]);
const booleanColumns = new Set(["is_editable"]);
const numericScales = new Map([["amount", 2], ["converted_amount", 2], ["exchange_rate", 6]]);

const tableSpecs = [
  ["users", ["id", "name", "email", "email_verified", "image", "created_at", "updated_at", "deleted_at"]],
  ["currency_rates", ["date", "base", "rates", "updated_at"]],
  ["ledgers", ["id", "user_id", "metadata", "created_at", "updated_at", "deleted_at"]],
  ["entry_categories", ["id", "ledger_id", "name", "description", "icon", "sort_order", "is_editable", "created_at", "updated_at", "deleted_at"]],
  ["service_credentials", ["id", "key", "ledger_id", "name", "created_at", "last_used_at", "deleted_at"]],
  ["otp_tokens", ["id", "email", "token_hash", "expires", "attempts", "locked_until", "created_at", "last_attempt_at", "verified_at", "ip_address"]],
  ["source_documents", ["id", "ledger_id", "title", "text", "image_urls", "status", "type", "anomaly_reason", "entry_date", "metadata", "active_revision_id", "pending_revision_id", "created_at", "updated_at", "deleted_at"]],
  ["source_document_revisions", ["id", "ledger_id", "source_document_id", "revision_number", "submitted_text", "outcome", "anomaly_reason", "failure_code", "submitted_at", "finalized_at", "created_at"]],
  ["stored_files", ["id", "ledger_id", "storage_provider", "storage_key", "content_type", "byte_size", "original_filename", "checksum", "created_at", "finalized_at", "deleted_at"]],
  ["ledger_entries", ["id", "ledger_id", "category_id", "source_document_id", "source_document_revision_id", "amount", "currency", "item_name", "description", "converted_amount", "exchange_rate", "created_at", "updated_at", "deleted_at"]],
  ["processing_attempts", ["id", "ledger_id", "revision_id", "attempt_number", "status", "retry_classification", "diagnostic_code", "correlation_id", "started_at", "completed_at", "created_at"]],
  ["processing_outbox", ["id", "ledger_id", "revision_id", "attempt_number", "idempotency_key", "status", "payload", "available_at", "claim_token", "claimed_at", "claim_expires_at", "completed_at", "created_at"]],
  ["upload_sessions", ["id", "ledger_id", "finalization_token_hash", "status", "expires_at", "finalized_at", "created_at"]],
  ["revision_files", ["id", "ledger_id", "revision_id", "stored_file_id", "position", "created_at"]],
  ["revision_entries", ["id", "ledger_id", "revision_id", "ledger_entry_id", "position", "created_at"]],
  ["upload_session_files", ["id", "ledger_id", "upload_session_id", "stored_file_id", "target_id", "position", "expected_content_type", "expected_byte_size", "original_filename", "expected_checksum", "status", "created_at"]],
  ["idempotency_records", ["key", "status", "result", "created_at", "completed_at"]],
].map(([name, columns]) => ({ name, columns, primaryKey: columns[0] }));

const activeDocuments = "SELECT id FROM source_documents WHERE deleted_at IS NULL";
const activeRevisions = `SELECT id FROM source_document_revisions WHERE source_document_id IN (${activeDocuments})`;
const filters = {
  source_documents: "deleted_at IS NULL",
  source_document_revisions: `source_document_id IN (${activeDocuments})`,
  ledger_entries: `source_document_id IS NULL OR source_document_id IN (${activeDocuments})`,
  revision_files: `revision_id IN (${activeRevisions})`,
  revision_entries: `revision_id IN (${activeRevisions}) AND ledger_entry_id IN (SELECT id FROM ledger_entries WHERE source_document_id IS NULL OR source_document_id IN (${activeDocuments}))`,
  processing_attempts: `revision_id IN (${activeRevisions})`,
  processing_outbox: `revision_id IN (${activeRevisions})`,
  stored_files: `id IN (SELECT stored_file_id FROM revision_files WHERE revision_id IN (${activeRevisions}) UNION SELECT stored_file_id FROM upload_session_files WHERE stored_file_id IS NOT NULL)`,
};

function parseArgs(argv) {
  const options = { apply: false, approvedProductionStop: false, source: DEFAULT_SOURCE, uploads: DEFAULT_UPLOADS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--approved-production-stop") options.approvedProductionStop = true;
    else if (argument === "--source") options.source = argv[++index];
    else if (argument === "--uploads") options.uploads = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.apply && !options.approvedProductionStop) {
    throw new Error("--apply requires --approved-production-stop because the target is replaced transactionally");
  }
  return options;
}

function loadLocalEnvironment() {
  for (const filename of [".env.local", ".env.neon.local"]) {
    if (!fs.existsSync(filename)) continue;
    for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (match == null || process.env[match[1]] != null) continue;
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

function quote(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function sourceFingerprint(filename) {
  const hash = crypto.createHash("sha256");
  for (const candidate of [filename, `${filename}-wal`]) {
    if (fs.existsSync(candidate)) hash.update(fs.readFileSync(candidate));
  }
  return hash.digest("hex");
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}

function convertValue(column, value) {
  if (value == null) return null;
  if (timestampColumns.has(column)) return new Date(Number(value));
  if (jsonColumns.has(column)) return parseJson(value, column === "image_urls" ? [] : {});
  if (booleanColumns.has(column)) return Boolean(value);
  const scale = numericScales.get(column);
  if (scale != null) return Number(value).toFixed(scale);
  return value;
}

function loadSourceRows(db, spec) {
  const available = new Set(db.prepare(`PRAGMA table_info(${quote(spec.name)})`).all().map((row) => row.name));
  const missing = spec.columns.filter((column) => !available.has(column));
  if (missing.length > 0) throw new Error(`${spec.name} is missing columns: ${missing.join(", ")}`);
  const rows = db.prepare(`SELECT ${spec.columns.map(quote).join(", ")} FROM ${quote(spec.name)} WHERE ${filters[spec.name] ?? "1 = 1"} ORDER BY ${quote(spec.primaryKey)}`).all();
  return rows.map((row) => Object.fromEntries(spec.columns.map((column) => [column, convertValue(column, row[column])])));
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value != null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function rowsHash(rows, columns) {
  const normalized = rows.map((row) => columns.map((column) => stableValue(row[column])));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function verifyLocalFiles(rows, uploadsPath) {
  const missing = rows
    .filter((row) => row.storage_provider === "local" && row.deleted_at == null)
    .filter((row) => !fs.existsSync(path.join(uploadsPath, row.storage_key)))
    .map((row) => row.storage_key);
  if (missing.length > 0) throw new Error(`Missing ${missing.length} local stored files; first: ${missing[0]}`);
  return rows.filter((row) => row.storage_provider === "local" && row.deleted_at == null).length;
}

async function insertRows(client, spec, rows) {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const tuples = batch.map((row) => `(${spec.columns.map((column) => {
      values.push(jsonColumns.has(column) && row[column] != null ? JSON.stringify(row[column]) : row[column]);
      return `$${values.length}`;
    }).join(", ")})`);
    await client.query(`INSERT INTO ${quote(spec.name)} (${spec.columns.map(quote).join(", ")}) VALUES ${tuples.join(", ")}`, values);
  }
}

async function readTargetRows(client, spec) {
  const result = await client.query(`SELECT ${spec.columns.map(quote).join(", ")} FROM ${quote(spec.name)} ORDER BY ${quote(spec.primaryKey)}`);
  return result.rows.map((row) => Object.fromEntries(spec.columns.map((column) => [column, convertValue(column, row[column])])));
}

async function main() {
  loadLocalEnvironment();
  const options = parseArgs(process.argv.slice(2));
  const databasePath = path.resolve(options.source.replace(/^file:/, ""));
  const uploadsPath = path.resolve(options.uploads);
  if (!fs.existsSync(databasePath)) throw new Error(`SQLite source not found: ${databasePath}`);
  if (!fs.existsSync(uploadsPath)) throw new Error(`Uploads directory not found: ${uploadsPath}`);

  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    if (sqlite.pragma("integrity_check", { simple: true }) !== "ok" || sqlite.pragma("foreign_key_check").length !== 0) {
      throw new Error("SQLite integrity preflight failed");
    }
    const source = new Map(tableSpecs.map((spec) => [spec.name, loadSourceRows(sqlite, spec)]));
    const excludedDeletedDocuments = sqlite.prepare("SELECT count(*) AS count FROM source_documents WHERE deleted_at IS NOT NULL").get().count;
    const verifiedLocalFiles = verifyLocalFiles(source.get("stored_files"), uploadsPath);
    const summary = {
      mode: options.apply ? "apply" : "dry-run",
      source: databasePath,
      sourceFingerprint: sourceFingerprint(databasePath),
      targetSchema: "public",
      excludedDeletedDocuments,
      verifiedLocalFiles,
      sourceCounts: Object.fromEntries(tableSpecs.map((spec) => [spec.name, source.get(spec.name).length])),
    };
    if (!options.apply) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.NEON_DATABASE_URL;
    if (connectionString == null || !/^postgres(ql)?:\/\//.test(connectionString)) {
      throw new Error("DATABASE_MIGRATION_URL or NEON_DATABASE_URL must be a PostgreSQL URL");
    }
    const client = new Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [0x43415348]);
      const schema = await client.query("SELECT current_schema() AS schema, to_regclass('public.users') AS users_table");
      if (schema.rows[0]?.schema !== "public" || schema.rows[0]?.users_table == null) {
        throw new Error("PostgreSQL public schema is not migrated; run npm run db:migrate first");
      }
      await client.query(`TRUNCATE TABLE ${tableSpecs.slice().reverse().map((spec) => quote(spec.name)).join(", ")} CASCADE`);
      for (const spec of tableSpecs) await insertRows(client, spec, source.get(spec.name));

      const targetCounts = {};
      const mismatches = {};
      for (const spec of tableSpecs) {
        const sourceRows = source.get(spec.name);
        const targetRows = await readTargetRows(client, spec);
        targetCounts[spec.name] = targetRows.length;
        const sourceHash = rowsHash(sourceRows, spec.columns);
        const targetHash = rowsHash(targetRows, spec.columns);
        if (sourceRows.length !== targetRows.length || sourceHash !== targetHash) {
          mismatches[spec.name] = { sourceCount: sourceRows.length, targetCount: targetRows.length, sourceHash, targetHash };
        }
      }
      const deletedTarget = Number((await client.query("SELECT count(*) AS count FROM source_documents WHERE deleted_at IS NOT NULL")).rows[0].count);
      const danglingPointers = Number((await client.query(`SELECT count(*) AS count FROM source_documents d WHERE (d.active_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM source_document_revisions r WHERE r.id = d.active_revision_id AND r.source_document_id = d.id)) OR (d.pending_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM source_document_revisions r WHERE r.id = d.pending_revision_id AND r.source_document_id = d.id))`)).rows[0].count);
      const reconciliation = { targetCounts, deletedTargetDocuments: deletedTarget, danglingRevisionPointers: danglingPointers, mismatchCount: Object.keys(mismatches).length, mismatches };
      if (deletedTarget !== 0 || danglingPointers !== 0 || reconciliation.mismatchCount !== 0) {
        throw new Error(`PostgreSQL reconciliation failed: ${JSON.stringify(reconciliation)}`);
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({ ...summary, reconciliation }, null, 2));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.end();
    }
  } finally {
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(`[db:migrate:neon] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
