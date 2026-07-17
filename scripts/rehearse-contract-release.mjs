#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

function parseArgs(argv) {
  const options = { backup: null, image: null, report: null, port: 3220 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--backup") options.backup = argv[++index];
    else if (arg === "--image") options.image = argv[++index];
    else if (arg === "--report") options.report = argv[++index];
    else if (arg === "--port") options.port = Number.parseInt(argv[++index], 10);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.backup || !options.image || !options.report) {
    throw new Error("--backup, --image, and --report are required");
  }
  return options;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function docker(args) {
  return run("docker", args);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashRows(db, sql, ...params) {
  return digest(JSON.stringify(db.prepare(sql).all(...params)));
}

function hashFiles(root, relative = "") {
  const hash = createHash("sha256");
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      const child = hashFiles(root, next);
      files += child.files;
      bytes += child.bytes;
      hash.update(child.sha256);
    } else if (entry.isFile()) {
      const body = readFileSync(path.join(root, next));
      files += 1;
      bytes += body.length;
      hash.update(next.split(path.sep).join("/"));
      hash.update("\0");
      hash.update(body);
    } else {
      throw new Error("Unsupported upload entry");
    }
  }
  return { files, bytes, sha256: hash.digest("hex") };
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const start = Date.now();
  let last = "not attempted";
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 400) return response.status;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`HTTP startup timed out: ${last}`);
}

function containerArgs(name, image, dataRoot, port) {
  return [
    "run",
    "--detach",
    "--name",
    name,
    "--publish",
    `127.0.0.1:${port}:3000`,
    "--volume",
    `${dataRoot}:/app/data`,
    "--env",
    "DATABASE_URL=file:/app/data/sqlite.db",
    "--env",
    "LOCAL_STORAGE_PATH=/app/data/uploads",
    "--env",
    "OPENAI_API_KEY=contract-release-no-network",
    "--env",
    "OPENAI_BASE_URL=http://127.0.0.1:9/v1",
    "--env",
    "AUTH_SECRET=contract-release-local-only-secret",
    "--env",
    `AUTH_URL=http://127.0.0.1:${port}`,
    "--env",
    `NEXT_PUBLIC_APP_URL=http://127.0.0.1:${port}`,
    "--env",
    "DISABLE_REGISTRATION=true",
    image,
  ];
}

const options = parseArgs(process.argv.slice(2));
const backup = path.resolve(options.backup);
const reportPath = path.resolve(options.report);
const scratch = path.join(path.dirname(reportPath), `.contract-release-${process.pid}`);
const dataRoot = path.join(scratch, "data");
const databasePath = path.join(dataRoot, "sqlite.db");
const uploadsPath = path.join(dataRoot, "uploads");
const container = `cashier-contract-release-${process.pid}`;
let started = false;

try {
  assert(existsSync(path.join(backup, "manifest.json")), "Backup manifest is missing");
  const backupVerification = JSON.parse(
    run("node", ["scripts/verify-coordinated-backup.mjs", "--backup", backup])
  );
  mkdirSync(dataRoot, { recursive: true });
  for (const file of readdirSync(path.join(backup, "database"))) {
    cpSync(path.join(backup, "database", file), path.join(dataRoot, file));
  }
  cpSync(path.join(backup, "uploads"), uploadsPath, { recursive: true });
  run("chmod", ["-R", "u+rwX,go+rwX", dataRoot]);

  const beforeDb = new Database(databasePath);
  beforeDb.pragma("wal_checkpoint(TRUNCATE)");
  const credential = beforeDb
    .prepare(
      "SELECT key, ledger_id ledgerId FROM service_credentials WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1"
    )
    .get();
  assert(credential != null, "Contract rehearsal requires one retained service credential");
  const baseline = {
    sourceCount: beforeDb.prepare("SELECT COUNT(*) count FROM source_documents").get().count,
    legacyRows: hashRows(
      beforeDb,
      "SELECT id, text, image_urls, status, anomaly_reason, metadata FROM source_documents ORDER BY id"
    ),
    taskRows: hashRows(beforeDb, "SELECT * FROM task_runs ORDER BY id"),
    excludedCount: beforeDb
      .prepare("SELECT COUNT(*) count FROM source_documents WHERE deleted_at IS NOT NULL")
      .get().count,
    excludedRows: hashRows(
      beforeDb,
      "SELECT * FROM source_documents WHERE deleted_at IS NOT NULL ORDER BY id"
    ),
    excludedLedgerRows: hashRows(
      beforeDb,
      "SELECT le.* FROM ledger_entries le JOIN source_documents sd ON sd.id=le.source_document_id WHERE sd.deleted_at IS NOT NULL ORDER BY le.id"
    ),
    stableTargetRows: hashRows(
      beforeDb,
      "SELECT sd.id, sd.active_revision_id, r.outcome FROM source_documents sd JOIN source_document_revisions r ON r.id=sd.active_revision_id WHERE sd.pending_revision_id IS NULL AND sd.deleted_at IS NULL ORDER BY sd.id"
    ),
    storedFiles: hashRows(beforeDb, "SELECT * FROM stored_files ORDER BY id"),
    uploads: hashFiles(uploadsPath),
  };
  beforeDb.close();

  docker(containerArgs(container, options.image, dataRoot, options.port));
  started = true;
  const startupHttp = await waitForHttp(`http://127.0.0.1:${options.port}/en/login`);
  const startupLogs = docker(["logs", container]);
  assert(
    startupLogs.includes("[INIT] Migrations completed successfully"),
    "Entrypoint migration did not complete"
  );
  assert(/"unresolvedCount":\s*0/.test(startupLogs), "Startup reconciliation was not zero");

  const unauthenticated = await fetch(`http://127.0.0.1:${options.port}/api/v1/source-documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "scan" }),
  });
  const unauthenticatedBody = await unauthenticated.text();
  assert(unauthenticated.status === 401, "Sensitive-response smoke expected HTTP 401");
  assert(
    !/(sqlite|\/app\/|storage[_ -]?key|openai|stack|prompt|contract-release-no-network)/i.test(
      unauthenticatedBody
    ),
    "Sensitive response material detected"
  );

  const writeResponse = await fetch(`http://127.0.0.1:${options.port}/api/v1/source-documents`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential.key}`,
      "content-type": "application/json",
      "idempotency-key": "task10-target-only-write",
    },
    body: JSON.stringify({ text: "Contract release target-only write" }),
  });
  const writeBody = await writeResponse.json();
  assert(writeResponse.status === 201, "Target API write did not return 201");
  assert(
    writeBody.revisionState === "queued" && writeBody.status === "queued",
    "API v1 compatibility fixture mismatch"
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));

  docker(["restart", container]);
  const restartHttp = await waitForHttp(`http://127.0.0.1:${options.port}/en/login`);
  const migrationRerun = docker(["exec", container, "npm", "run", "db:migrate"]);
  assert(/"batches":\s*0/.test(migrationRerun), "Backfill rerun was not idempotent");
  assert(
    /"unresolvedCount":\s*0/.test(migrationRerun),
    "Migration rerun reconciliation was not zero"
  );

  const afterDb = new Database(databasePath, { readonly: true });
  const created = afterDb
    .prepare(
      "SELECT text, image_urls imageUrls, status, anomaly_reason anomalyReason, active_revision_id activeRevisionId, pending_revision_id pendingRevisionId FROM source_documents WHERE id=?"
    )
    .get(writeBody.sourceDocumentId);
  assert(created != null, "Target-only source document is missing");
  assert(
    created.text == null &&
      created.imageUrls === "[]" &&
      created.status === "queued" &&
      created.anomalyReason == null,
    "Target write produced a legacy compatibility projection"
  );
  const targetRevision = afterDb
    .prepare(
      "SELECT submitted_text submittedText FROM source_document_revisions WHERE id=? AND source_document_id=?"
    )
    .get(writeBody.revisionId, writeBody.sourceDocumentId);
  assert(
    targetRevision?.submittedText === "Contract release target-only write",
    "Submitted evidence is not in the target revision"
  );
  const targetIntent = afterDb
    .prepare("SELECT COUNT(*) count FROM processing_outbox WHERE revision_id=?")
    .get(writeBody.revisionId).count;
  assert(targetIntent === 1, "Target processing intent is missing or duplicated");
  const integrity = afterDb.pragma("integrity_check", { simple: true });
  const foreignKeys = afterDb.pragma("foreign_key_check");
  const finalEvidence = {
    legacyRows: hashRows(
      afterDb,
      "SELECT id, text, image_urls, status, anomaly_reason, metadata FROM source_documents WHERE id<>? ORDER BY id",
      writeBody.sourceDocumentId
    ),
    taskRows: hashRows(afterDb, "SELECT * FROM task_runs ORDER BY id"),
    excludedCount: afterDb
      .prepare("SELECT COUNT(*) count FROM source_documents WHERE deleted_at IS NOT NULL")
      .get().count,
    excludedRows: hashRows(
      afterDb,
      "SELECT * FROM source_documents WHERE deleted_at IS NOT NULL ORDER BY id"
    ),
    excludedLedgerRows: hashRows(
      afterDb,
      "SELECT le.* FROM ledger_entries le JOIN source_documents sd ON sd.id=le.source_document_id WHERE sd.deleted_at IS NOT NULL ORDER BY le.id"
    ),
    stableTargetRows: hashRows(
      afterDb,
      "SELECT sd.id, sd.active_revision_id, r.outcome FROM source_documents sd JOIN source_document_revisions r ON r.id=sd.active_revision_id WHERE sd.pending_revision_id IS NULL AND sd.deleted_at IS NULL AND sd.id<>? ORDER BY sd.id",
      writeBody.sourceDocumentId
    ),
    storedFiles: hashRows(afterDb, "SELECT * FROM stored_files ORDER BY id"),
    uploads: hashFiles(uploadsPath),
  };
  afterDb.close();

  assert(finalEvidence.legacyRows === baseline.legacyRows, "Existing legacy source rows changed");
  assert(finalEvidence.taskRows === baseline.taskRows, "Legacy task history changed");
  assert(
    finalEvidence.excludedCount === baseline.excludedCount &&
      finalEvidence.excludedRows === baseline.excludedRows &&
      finalEvidence.excludedLedgerRows === baseline.excludedLedgerRows,
    "Excluded deleted population changed"
  );
  assert(
    finalEvidence.stableTargetRows === baseline.stableTargetRows,
    "Existing stable target data changed"
  );
  assert(finalEvidence.storedFiles === baseline.storedFiles, "Existing stored-file rows changed");
  assert(
    JSON.stringify(finalEvidence.uploads) === JSON.stringify(baseline.uploads),
    "Upload files changed"
  );
  assert(
    integrity === "ok" && foreignKeys.length === 0,
    "SQLite integrity or foreign-key check failed"
  );

  const imageDigest = docker(["image", "inspect", options.image, "--format", "{{.Id}}"]).trim();
  const report = {
    formatVersion: 1,
    accepted: true,
    contractVersion: "cashier-application-contracts@1.0.0",
    image: options.image,
    imageDigest,
    backup,
    backupVerification,
    startupHttp,
    restartHttp,
    migrationRerun: { batches: 0, unresolvedCount: 0 },
    apiV1: {
      status: writeResponse.status,
      revisionState: writeBody.revisionState,
      deprecatedStatus: writeBody.status,
    },
    targetOnlyWrite: {
      sourceDocumentId: writeBody.sourceDocumentId,
      revisionId: writeBody.revisionId,
      legacyProjectionUnchanged: true,
      processingIntents: targetIntent,
    },
    integrityCheck: integrity,
    foreignKeyViolations: foreignKeys.length,
    baseline,
    finalEvidence,
    sensitiveResponseScan: "passed",
  };
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (started) {
    try {
      docker(["rm", "--force", container]);
    } catch {}
  }
  rmSync(scratch, { recursive: true, force: true });
}
