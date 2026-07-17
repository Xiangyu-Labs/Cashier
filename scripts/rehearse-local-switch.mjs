#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import sharp from "sharp";

function parseArgs(argv) {
  const options = {
    sourceData: "./data",
    backup: null,
    report: null,
    candidateImage: null,
    priorImage: null,
    port: 3219,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source-data") options.sourceData = argv[++index];
    else if (arg === "--backup") options.backup = argv[++index];
    else if (arg === "--report") options.report = argv[++index];
    else if (arg === "--candidate-image") options.candidateImage = argv[++index];
    else if (arg === "--prior-image") options.priorImage = argv[++index];
    else if (arg === "--port") options.port = Number.parseInt(argv[++index], 10);
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function docker(args, options) {
  return run("docker", args, options);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashRows(db, sql) {
  return sha256(JSON.stringify(db.prepare(sql).all()));
}

function collectFiles(root, relative = "") {
  const files = [];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(root, next));
    else if (entry.isFile()) files.push(next);
    else throw new Error("Unsupported entry in rehearsal upload copy");
  }
  return files;
}

function hashUploads(root) {
  const files = collectFiles(root).sort();
  const digest = createHash("sha256");
  let bytes = 0;
  for (const file of files) {
    const body = readFileSync(path.join(root, file));
    bytes += body.length;
    digest.update(file.split(path.sep).join("/"));
    digest.update("\0");
    digest.update(body);
  }
  return { files: files.length, bytes, sha256: digest.digest("hex") };
}

function makeContainerArgs({ name, image, dataRoot, port, skipMigrations = false }) {
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
    "OPENAI_API_KEY=local-rehearsal-no-network",
    "--env",
    "OPENAI_BASE_URL=http://127.0.0.1:9/v1",
    "--env",
    "AUTH_SECRET=local-rehearsal-auth-secret-not-production",
    "--env",
    `AUTH_URL=http://127.0.0.1:${port}`,
    "--env",
    `NEXT_PUBLIC_APP_URL=http://127.0.0.1:${port}`,
    "--env",
    "MAX_TASK_WORKER=0",
    "--env",
    "DISABLE_REGISTRATION=true",
    "--env",
    `SKIP_MIGRATIONS=${skipMigrations ? "true" : "false"}`,
    image,
  ];
}

async function waitForHttp(url, timeoutMs = 90_000) {
  const startedAt = performance.now();
  let lastError = "not attempted";
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const requestAt = performance.now();
      const response = await fetch(url, { redirect: "manual" });
      const body = await response.text();
      if (response.status >= 200 && response.status < 400) {
        return {
          status: response.status,
          bytes: Buffer.byteLength(body),
          latencyMs: Number((performance.now() - requestAt).toFixed(2)),
        };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`HTTP startup smoke timed out: ${lastError}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function prepareLegacyDrain(databasePath) {
  const db = new Database(databasePath);
  const now = Date.now();
  const ledger = db
    .prepare("SELECT id FROM ledgers WHERE deleted_at IS NULL ORDER BY id LIMIT 1")
    .get();
  assert(ledger != null, "Rehearsal requires one active local ledger");
  const fixturePrefix = `local-switch-${randomUUID()}`;
  const insertTask = db.prepare(
    "INSERT INTO task_runs (id, type, title, input, status, created_at, updated_at, started_at, completed_at, scope_id, entity_type, entity_id) VALUES (?, 'parse_source_document', 'Local switch fixture', '{}', ?, ?, ?, ?, ?, ?, 'source_document', ?)"
  );
  insertTask.run(
    `${fixturePrefix}-queued`,
    "pending",
    now,
    now,
    null,
    null,
    ledger.id,
    fixturePrefix
  );
  insertTask.run(
    `${fixturePrefix}-running`,
    "running",
    now,
    now,
    now,
    null,
    ledger.id,
    fixturePrefix
  );
  insertTask.run(
    `${fixturePrefix}-terminal`,
    "completed",
    now,
    now,
    now,
    now,
    ledger.id,
    fixturePrefix
  );
  const before = db
    .prepare("SELECT status, COUNT(*) count FROM task_runs GROUP BY status ORDER BY status")
    .all();
  const drained = db
    .prepare(
      "UPDATE task_runs SET status = 'cancelled', error = NULL, progress = NULL, completed_at = ?, updated_at = ? WHERE status IN ('pending', 'queued', 'running')"
    )
    .run(now, now).changes;
  const ambiguous = db
    .prepare(
      "SELECT COUNT(*) count FROM task_runs WHERE status IN ('pending', 'queued', 'running')"
    )
    .get().count;
  const credentialId = `${fixturePrefix}-credential`;
  const credentialKey = `sk_local_${randomUUID().replaceAll("-", "")}`;
  db.prepare(
    "INSERT INTO service_credentials (id, key, ledger_id, name, created_at) VALUES (?, ?, ?, 'Local switch rehearsal', ?)"
  ).run(credentialId, credentialKey, ledger.id, now);
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
  assert(ambiguous === 0, "Legacy drain left an ambiguous task state");
  return { before, drained, ambiguous, credentialId, credentialKey, ledgerId: ledger.id };
}

function collectBaseline(databasePath, uploadsPath) {
  const db = new Database(databasePath, { readonly: true });
  const baseline = {
    excludedDeletedDocuments: db
      .prepare("SELECT COUNT(*) count FROM source_documents WHERE deleted_at IS NOT NULL")
      .get().count,
    excludedSourceRowsSha256: hashRows(
      db,
      "SELECT * FROM source_documents WHERE deleted_at IS NOT NULL ORDER BY id"
    ),
    excludedLedgerRowsSha256: hashRows(
      db,
      "SELECT le.* FROM ledger_entries le JOIN source_documents sd ON sd.id = le.source_document_id WHERE sd.deleted_at IS NOT NULL ORDER BY le.id"
    ),
    uploads: hashUploads(uploadsPath),
  };
  db.close();
  return baseline;
}

function collectReconciliation(databasePath, uploadsPath, documentId, baseline) {
  const db = new Database(databasePath, { readonly: true });
  const excluded = db
    .prepare(
      `SELECT
        COUNT(DISTINCT sd.id) documents,
        COUNT(DISTINCT r.id) revisions,
        SUM(CASE WHEN sd.active_revision_id IS NOT NULL OR sd.pending_revision_id IS NOT NULL THEN 1 ELSE 0 END) pointers,
        COUNT(DISTINCT re.id) projections
       FROM source_documents sd
       LEFT JOIN source_document_revisions r ON r.source_document_id = sd.id
       LEFT JOIN revision_entries re ON re.revision_id = r.id
       WHERE sd.deleted_at IS NOT NULL`
    )
    .get();
  const ownershipMismatches = db
    .prepare(
      "SELECT COUNT(*) count FROM source_document_revisions r JOIN source_documents sd ON sd.id = r.source_document_id WHERE r.ledger_id <> sd.ledger_id"
    )
    .get().count;
  const invalidPointers = db
    .prepare(
      `SELECT COUNT(*) count FROM source_documents sd
       WHERE (sd.active_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM source_document_revisions r WHERE r.id = sd.active_revision_id AND r.source_document_id = sd.id AND r.ledger_id = sd.ledger_id))
          OR (sd.pending_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM source_document_revisions r WHERE r.id = sd.pending_revision_id AND r.source_document_id = sd.id AND r.ledger_id = sd.ledger_id))`
    )
    .get().count;
  const duplicateLedgerProjections = db
    .prepare(
      "SELECT COUNT(*) count FROM (SELECT ledger_entry_id FROM revision_entries GROUP BY ledger_entry_id HAVING COUNT(*) > 1)"
    )
    .get().count;
  const candidateProjection = db
    .prepare(
      `SELECT sd.id, sd.ledger_id legacyLedgerId, sd.text legacyText, sd.status legacyStatus,
              r.ledger_id targetLedgerId, r.submitted_text targetText, r.outcome targetOutcome,
              sd.created_at legacyCreatedAt, r.created_at targetCreatedAt
       FROM source_documents sd
       JOIN source_document_revisions r ON r.source_document_id = sd.id
       WHERE sd.id = ? ORDER BY r.revision_number DESC LIMIT 1`
    )
    .get(documentId);
  const processing = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status IN ('pending', 'claimed') THEN 1 ELSE 0 END) pending,
        MAX(CASE WHEN status IN ('pending', 'claimed') THEN CAST((unixepoch() * 1000 - created_at) / 1000 AS INTEGER) END) maxAgeSeconds,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) completed
       FROM processing_outbox`
    )
    .get();
  const integrityCheck = db.pragma("integrity_check", { simple: true });
  const foreignKeyViolations = db.pragma("foreign_key_check").length;
  const sourceRowsSha256 = hashRows(
    db,
    "SELECT * FROM source_documents WHERE deleted_at IS NOT NULL ORDER BY id"
  );
  const ledgerRowsSha256 = hashRows(
    db,
    "SELECT le.* FROM ledger_entries le JOIN source_documents sd ON sd.id = le.source_document_id WHERE sd.deleted_at IS NOT NULL ORDER BY le.id"
  );
  db.close();
  const uploads = hashUploads(uploadsPath);
  assert(integrityCheck === "ok", "SQLite integrity_check failed");
  assert(foreignKeyViolations === 0, "SQLite foreign-key check failed");
  assert(excluded.documents === baseline.excludedDeletedDocuments, "Excluded population changed");
  assert(
    excluded.revisions === 0 && excluded.pointers === 0 && excluded.projections === 0,
    "Excluded deleted target rows were created"
  );
  assert(sourceRowsSha256 === baseline.excludedSourceRowsSha256, "Excluded source rows changed");
  assert(ledgerRowsSha256 === baseline.excludedLedgerRowsSha256, "Excluded ledger rows changed");
  assert(uploads.sha256 === baseline.uploads.sha256, "Upload bytes changed");
  assert(ownershipMismatches === 0, "Target ownership mismatch found");
  assert(invalidPointers === 0, "Invalid active/pending pointer found");
  assert(duplicateLedgerProjections === 0, "Duplicate ledger projection found");
  assert(candidateProjection != null, "Candidate compatibility write is missing");
  assert(
    candidateProjection.legacyLedgerId === candidateProjection.targetLedgerId,
    "Candidate ownership projection differs"
  );
  assert(
    candidateProjection.legacyText === candidateProjection.targetText,
    "Candidate text projection differs"
  );
  return {
    integrityCheck,
    foreignKeyViolations,
    excluded,
    excludedSourceRowsSha256: sourceRowsSha256,
    excludedLedgerRowsSha256: ledgerRowsSha256,
    uploads,
    ownershipMismatches,
    invalidPointers,
    duplicateLedgerProjections,
    candidateProjection,
    processing: {
      pending: processing.pending ?? 0,
      maxAgeSeconds: processing.maxAgeSeconds ?? 0,
      completed: processing.completed ?? 0,
    },
  };
}

async function verifyStoredFiles(databasePath, uploadsPath) {
  const db = new Database(databasePath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT sf.storage_provider storageProvider, sf.storage_key storageKey,
              sf.content_type contentType, sf.byte_size byteSize, sf.checksum,
              rf.position, sd.image_urls imageUrls
       FROM stored_files sf
       JOIN revision_files rf ON rf.stored_file_id = sf.id
       JOIN source_document_revisions r ON r.id = rf.revision_id
       JOIN source_documents sd ON sd.id = r.source_document_id
       WHERE sf.deleted_at IS NULL
       ORDER BY sf.id`
    )
    .all();
  db.close();
  const root = path.resolve(uploadsPath);
  let local = 0;
  let legacyInline = 0;
  for (const row of rows) {
    let body;
    if (row.storageProvider === "local") {
      const filePath = path.resolve(root, row.storageKey);
      assert(filePath.startsWith(`${root}${path.sep}`), "Stored-file key escaped upload root");
      assert(existsSync(filePath), "Stored local file is missing");
      body = readFileSync(filePath);
      local += 1;
    } else if (row.storageProvider === "legacy-inline") {
      const source = JSON.parse(row.imageUrls)[row.position];
      const match = /^data:([^;,]+);base64,(.+)$/.exec(source ?? "");
      assert(match != null, "Legacy inline stored file has no parseable data URI");
      body = Buffer.from(match[2], "base64");
      legacyInline += 1;
    } else {
      throw new Error(`Unsupported local rehearsal storage provider: ${row.storageProvider}`);
    }
    assert(body.length === row.byteSize, "Stored-file byte count differs from trusted metadata");
    assert(sha256(body) === row.checksum, "Stored-file checksum differs from trusted metadata");
    const metadata = await sharp(body).metadata();
    const expectedFormat = row.contentType === "image/jpeg" ? "jpeg" : row.contentType.slice(6);
    assert(metadata.format === expectedFormat, "Stored-file format differs from trusted metadata");
    assert(
      metadata.width != null && metadata.height != null,
      "Stored image dimensions are missing"
    );
  }
  return { total: rows.length, local, legacyInline, parseFailures: 0 };
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(
    "Usage: node scripts/rehearse-local-switch.mjs --candidate-image <tag> --prior-image <tag> --backup <new-directory> --report <json-file> [--source-data ./data] [--port 3219]"
  );
  process.exit(0);
}
assert(typeof options.candidateImage === "string", "--candidate-image is required");
assert(typeof options.priorImage === "string", "--prior-image is required");
assert(typeof options.backup === "string", "--backup is required");
assert(typeof options.report === "string", "--report is required");
assert(Number.isInteger(options.port) && options.port > 0, "--port must be a positive integer");

const sourceData = path.resolve(options.sourceData);
const backupRoot = path.resolve(options.backup);
const reportPath = path.resolve(options.report);
const scratchRoot = path.join(path.dirname(backupRoot), `.task9-switch-${process.pid}`);
const initialBackup = path.join(scratchRoot, "initial-copy");
const workData = path.join(scratchRoot, "work-data");
const databasePath = path.join(workData, "sqlite.db");
const uploadsPath = path.join(workData, "uploads");
const candidateName = `cashier-task9-candidate-${process.pid}`;
const priorName = `cashier-task9-prior-${process.pid}`;
let activeContainer = null;

try {
  assert(existsSync(path.join(sourceData, "sqlite.db")), "Source SQLite database does not exist");
  assert(existsSync(path.join(sourceData, "uploads")), "Source upload directory does not exist");
  assert(!existsSync(backupRoot), "Pre-switch backup destination already exists");
  mkdirSync(scratchRoot, { recursive: true });
  run("node", [
    "scripts/coordinated-backup.mjs",
    "--database",
    `file:${path.join(sourceData, "sqlite.db")}`,
    "--uploads",
    path.join(sourceData, "uploads"),
    "--destination",
    initialBackup,
    "--write-freeze-confirmed",
  ]);
  mkdirSync(workData, { recursive: true });
  for (const file of readdirSync(path.join(initialBackup, "database"))) {
    cpSync(path.join(initialBackup, "database", file), path.join(workData, file));
  }
  cpSync(path.join(initialBackup, "uploads"), uploadsPath, { recursive: true });
  run("chmod", ["-R", "u+rwX,go+rX", workData]);

  const legacyDrain = prepareLegacyDrain(databasePath);
  const baseline = collectBaseline(databasePath, uploadsPath);
  run("node", [
    "scripts/coordinated-backup.mjs",
    "--database",
    `file:${databasePath}`,
    "--uploads",
    uploadsPath,
    "--destination",
    backupRoot,
    "--write-freeze-confirmed",
  ]);
  const backupVerification = JSON.parse(
    run("node", ["scripts/verify-coordinated-backup.mjs", "--backup", backupRoot])
  );

  docker(
    makeContainerArgs({
      name: candidateName,
      image: options.candidateImage,
      dataRoot: workData,
      port: options.port,
    })
  );
  activeContainer = candidateName;
  const candidateStart = await waitForHttp(`http://127.0.0.1:${options.port}/en/login`);
  const candidateStartLogs = docker(["logs", candidateName]);
  assert(
    candidateStartLogs.includes("[INIT] Migrations completed successfully"),
    "Candidate migration did not complete before startup"
  );
  assert(
    candidateStartLogs.indexOf("[INIT] Migrations completed successfully") <
      candidateStartLogs.indexOf("[INIT] Starting application"),
    "Application started before migration/reconciliation"
  );
  assert(
    /"unresolvedCount":\s*0/.test(candidateStartLogs),
    "Candidate startup reconciliation was not zero"
  );

  const unauthenticated = await fetch(`http://127.0.0.1:${options.port}/api/v1/source-documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "local sensitive response scan" }),
  });
  const unauthenticatedBody = await unauthenticated.text();
  assert(unauthenticated.status === 401, "Unauthenticated API smoke did not return 401");
  assert(
    !/(sqlite|\/app\/|storage[_ -]?key|openai|stack|prompt|credential.*local-rehearsal)/i.test(
      unauthenticatedBody
    ),
    "Sensitive material appeared in API response"
  );

  const writeStartedAt = performance.now();
  const candidateWriteResponse = await fetch(
    `http://127.0.0.1:${options.port}/api/v1/source-documents`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${legacyDrain.credentialKey}`,
        "content-type": "application/json",
        "idempotency-key": "task9-compatibility-write",
      },
      body: JSON.stringify({ text: "Local task 9 compatibility write" }),
    }
  );
  const candidateWriteBody = await candidateWriteResponse.json();
  const candidateWriteLatencyMs = Number((performance.now() - writeStartedAt).toFixed(2));
  assert(candidateWriteResponse.status === 201, "Candidate compatibility write did not return 201");
  assert(
    typeof candidateWriteBody.sourceDocumentId === "string",
    "Candidate write omitted sourceDocumentId"
  );
  assert(
    candidateWriteBody.status === "queued",
    "Candidate write omitted deprecated compatibility status"
  );
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  docker(["rm", "--force", candidateName]);
  activeContainer = null;
  docker(
    makeContainerArgs({
      name: priorName,
      image: options.priorImage,
      dataRoot: workData,
      port: options.port,
      skipMigrations: true,
    })
  );
  activeContainer = priorName;
  const priorStart = await waitForHttp(`http://127.0.0.1:${options.port}/en/login`);
  const priorRead = JSON.parse(
    docker([
      "exec",
      priorName,
      "node",
      "-e",
      "const Database=require('better-sqlite3');const db=new Database('/app/data/sqlite.db',{readonly:true});const row=db.prepare('SELECT id, ledger_id, text, status, image_urls FROM source_documents WHERE id=?').get(process.argv[1]);db.close();if(!row)process.exit(2);process.stdout.write(JSON.stringify(row));",
      candidateWriteBody.sourceDocumentId,
    ])
  );
  assert(
    priorRead.text === "Local task 9 compatibility write",
    "Prior image could not read candidate write"
  );
  assert(
    priorRead.ledger_id === legacyDrain.ledgerId,
    "Prior image read the wrong owner projection"
  );

  docker(["rm", "--force", priorName]);
  activeContainer = null;
  docker(
    makeContainerArgs({
      name: candidateName,
      image: options.candidateImage,
      dataRoot: workData,
      port: options.port,
    })
  );
  activeContainer = candidateName;
  const rollForwardStart = await waitForHttp(`http://127.0.0.1:${options.port}/en/login`);
  const rollForwardLogs = docker(["logs", candidateName]);
  assert(
    /"unresolvedCount":\s*0/.test(rollForwardLogs),
    "Roll-forward reconciliation was not zero"
  );
  assert(/"batches":\s*0/.test(rollForwardLogs), "Roll-forward backfill was not idempotent");

  docker(["restart", candidateName]);
  const restartStart = await waitForHttp(`http://127.0.0.1:${options.port}/en/login`);
  const migrationRerun = docker(["exec", candidateName, "npm", "run", "db:migrate"]);
  assert(
    /"unresolvedCount":\s*0/.test(migrationRerun),
    "Explicit migration rerun reconciliation was not zero"
  );
  assert(/"batches":\s*0/.test(migrationRerun), "Explicit migration rerun was not idempotent");

  const finalLogs = docker(["logs", candidateName]);
  const reconciliation = collectReconciliation(
    databasePath,
    uploadsPath,
    candidateWriteBody.sourceDocumentId,
    baseline
  );
  const storedFiles = await verifyStoredFiles(databasePath, uploadsPath);
  const lockingErrors = (finalLogs.match(/SQLITE_BUSY|SQLITE_LOCKED|database is locked/gi) ?? [])
    .length;
  const missingFileErrors = (finalLogs.match(/missing[-_ ]file|ENOENT/gi) ?? []).length;
  const requestFailures = 0;
  const publicLegacyDrain = {
    before: legacyDrain.before,
    drained: legacyDrain.drained,
    ambiguous: legacyDrain.ambiguous,
  };
  const report = {
    formatVersion: 1,
    accepted: true,
    candidateImage: options.candidateImage,
    priorImage: options.priorImage,
    sourceData,
    preSwitchBackup: backupRoot,
    backupVerification,
    legacyDrain: publicLegacyDrain,
    candidateStart,
    candidateWrite: {
      status: candidateWriteResponse.status,
      latencyMs: candidateWriteLatencyMs,
      sourceDocumentId: candidateWriteBody.sourceDocumentId,
      revisionId: candidateWriteBody.revisionId,
      compatibilityStatus: candidateWriteBody.status,
    },
    priorStart,
    priorRead: { id: priorRead.id, status: priorRead.status, readable: true },
    rollForwardStart,
    restartStart,
    migrationRerun: { batches: 0, unresolvedCount: 0 },
    reconciliation: { ...reconciliation, storedFiles },
    metrics: {
      sqliteLockingOrBusyErrors: lockingErrors,
      processingRecovery: reconciliation.processing,
      processingAgeSeconds: reconciliation.processing.maxAgeSeconds,
      missingFileErrors,
      requestFailures,
      responseLatencyMs: {
        candidateStart: candidateStart.latencyMs,
        candidateWrite: candidateWriteLatencyMs,
        priorStart: priorStart.latencyMs,
        rollForwardStart: rollForwardStart.latencyMs,
        restart: restartStart.latencyMs,
      },
      sanitizedErrorCodeFrequency: { UNAUTHENTICATED: 1 },
      duplicateLedgerProjectionsAfterRestart: reconciliation.duplicateLedgerProjections,
    },
  };
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (activeContainer != null) {
    try {
      docker(["rm", "--force", activeContainer]);
    } catch {
      // Preserve the original rehearsal error.
    }
  }
  rmSync(scratchRoot, { recursive: true, force: true });
  if (existsSync(reportPath)) chmodSync(reportPath, statSync(reportPath).mode & 0o777);
}
