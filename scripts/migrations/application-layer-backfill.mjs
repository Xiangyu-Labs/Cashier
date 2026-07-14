import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const APPLICATION_LAYER_BACKFILL_NAME = "application-layer-backfill-v1";

const LOCAL_UPLOAD_PREFIX = "/api/uploads/";
const OUTCOMES = new Set(["queued", "processing", "completed", "anomaly", "failed"]);

function stableId(kind, value) {
  return `${kind}:${createHash("sha256").update(value).digest("hex")}`;
}

function safeLocalKey(url) {
  if (typeof url !== "string") return { kind: "invalid" };

  const inlineMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (inlineMatch) {
    return {
      kind: "inline",
      contentType: inlineMatch[1],
      bytes: Buffer.from(inlineMatch[2], "base64"),
    };
  }

  const clean = url.split("?", 1)[0].split("#", 1)[0];
  if (!clean.startsWith(LOCAL_UPLOAD_PREFIX)) return { kind: "remote" };

  const key = clean.slice(LOCAL_UPLOAD_PREFIX.length);
  if (!key || key.startsWith("/") || key.includes("\\") || key.includes("..")) {
    return { kind: "invalid" };
  }
  return { kind: "local", key: key.split("/").filter(Boolean).join("/") };
}

function contentType(key) {
  const extension = path.extname(key).toLowerCase();
  return (
    new Map([
      [".jpg", "image/jpeg"],
      [".jpeg", "image/jpeg"],
      [".png", "image/png"],
      [".webp", "image/webp"],
      [".gif", "image/gif"],
      [".heic", "image/heic"],
    ]).get(extension) ?? "application/octet-stream"
  );
}

function mappedOutcome(document) {
  if (document.type === "manual" && document.status === "completed") return "completed";
  return OUTCOMES.has(document.status) ? document.status : null;
}

function parseJson(value, label, errors) {
  try {
    return value == null ? null : JSON.parse(value);
  } catch {
    errors.push(label);
    return null;
  }
}

function collectPlan(db, uploadsPath) {
  const errors = new Map();
  const addError = (kind) => errors.set(kind, (errors.get(kind) ?? 0) + 1);
  const documents = db.prepare("SELECT * FROM source_documents ORDER BY id").all();
  const entriesByDocument = new Map();

  for (const entry of db
    .prepare(
      "SELECT * FROM ledger_entries WHERE source_document_id IS NOT NULL ORDER BY source_document_id, created_at, id"
    )
    .all()) {
    const entries = entriesByDocument.get(entry.source_document_id) ?? [];
    entries.push(entry);
    entriesByDocument.set(entry.source_document_id, entries);
  }

  const planned = [];
  let excludedDeletedDocuments = 0;
  for (const document of documents) {
    // Deleted legacy documents and their source evidence are deliberately read-only recovery data.
    if (document.status === "deleted" || document.deleted_at !== null) {
      excludedDeletedDocuments += 1;
      continue;
    }

    const imageErrors = [];
    const images = parseJson(document.image_urls, "malformed_image_metadata", imageErrors);
    const metadata = parseJson(document.metadata, "malformed_legacy_metadata", imageErrors);
    for (const error of imageErrors) addError(error);
    if (!Array.isArray(images)) {
      addError("invalid_image_metadata");
      continue;
    }
    if (metadata !== null && (typeof metadata !== "object" || Array.isArray(metadata))) {
      addError("invalid_legacy_metadata");
    }

    const outcome = mappedOutcome(document);
    if (!outcome) addError("unmapped_document_status");

    const revisionId = stableId("legacy-revision", document.id);
    const files = [];
    for (let position = 0; position < images.length; position += 1) {
      const parsed = safeLocalKey(images[position]);
      if (parsed.kind === "remote") {
        addError("unmapped_non_local_image_url");
        continue;
      }
      if (parsed.kind === "invalid") {
        addError("invalid_local_image_url");
        continue;
      }
      if (parsed.kind === "inline") {
        files.push({
          id: stableId("legacy-inline-file", `${document.id}:${position}`),
          ledgerId: document.ledger_id,
          key: `source-document/${document.id}/${position}`,
          position,
          byteSize: parsed.bytes.length,
          contentType: parsed.contentType,
          filename: null,
          checksum: createHash("sha256").update(parsed.bytes).digest("hex"),
          provider: "legacy-inline",
        });
        continue;
      }

      const segments = parsed.key.split("/");
      if (segments[0] !== document.ledger_id) {
        addError("file_ownership_mismatch");
        continue;
      }
      const filePath = path.resolve(uploadsPath, parsed.key);
      if (
        !filePath.startsWith(`${path.resolve(uploadsPath)}${path.sep}`) ||
        !existsSync(filePath)
      ) {
        addError("missing_local_file");
        continue;
      }
      const stat = statSync(filePath);
      if (!stat.isFile()) {
        addError("invalid_local_file");
        continue;
      }
      files.push({
        id: stableId("legacy-file", parsed.key),
        ledgerId: document.ledger_id,
        key: parsed.key,
        position,
        byteSize: stat.size,
        contentType: contentType(parsed.key),
        filename: path.basename(parsed.key),
        checksum: createHash("sha256").update(readFileSync(filePath)).digest("hex"),
        provider: "local",
      });
    }

    const entries = entriesByDocument.get(document.id) ?? [];
    for (const entry of entries) {
      if (entry.ledger_id !== document.ledger_id) addError("entry_ownership_mismatch");
      if (!entry.amount || !entry.item_name || !entry.created_at) addError("invalid_legacy_entry");
    }
    planned.push({ document, revisionId, outcome, files, entries });
  }

  return { planned, errors, excludedDeletedDocuments };
}

function applyBatch(db, batch) {
  const insertRevision = db.prepare(
    "INSERT OR IGNORE INTO source_document_revisions (id, ledger_id, source_document_id, revision_number, submitted_text, outcome, anomaly_reason, failure_code, submitted_at, finalized_at, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertFile = db.prepare(
    "INSERT OR IGNORE INTO stored_files (id, ledger_id, storage_provider, storage_key, content_type, byte_size, original_filename, checksum, created_at, finalized_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertRevisionFile = db.prepare(
    "INSERT OR IGNORE INTO revision_files (id, ledger_id, revision_id, stored_file_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertRevisionEntry = db.prepare(
    "INSERT OR IGNORE INTO revision_entries (id, ledger_id, revision_id, ledger_entry_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const updateEntry = db.prepare(
    "UPDATE ledger_entries SET source_document_revision_id = ? WHERE id = ? AND ledger_id = ? AND (source_document_revision_id IS NULL OR source_document_revision_id = ?)"
  );
  const updateDocument = db.prepare(
    "UPDATE source_documents SET active_revision_id = ?, pending_revision_id = ? WHERE id = ? AND ledger_id = ? AND (active_revision_id IS NULL OR active_revision_id = ?) AND (pending_revision_id IS NULL OR pending_revision_id = ?)"
  );

  db.transaction(() => {
    for (const item of batch) {
      const finalizedAt =
        item.outcome === "queued" || item.outcome === "processing"
          ? null
          : item.document.updated_at;
      insertRevision.run(
        item.revisionId,
        item.document.ledger_id,
        item.document.id,
        item.document.text,
        item.outcome,
        item.outcome === "anomaly" ? item.document.anomaly_reason : null,
        item.outcome === "failed" ? "LEGACY_PROCESSING_FAILED" : null,
        item.document.created_at,
        finalizedAt,
        item.document.created_at
      );
      for (const file of item.files) {
        insertFile.run(
          file.id,
          file.ledgerId,
          file.provider,
          file.key,
          file.contentType,
          file.byteSize,
          file.filename,
          file.checksum,
          item.document.created_at,
          item.document.created_at
        );
        insertRevisionFile.run(
          stableId("legacy-revision-file", `${item.revisionId}:${file.id}`),
          file.ledgerId,
          item.revisionId,
          file.id,
          file.position,
          item.document.created_at
        );
      }
      for (let position = 0; position < item.entries.length; position += 1) {
        const entry = item.entries[position];
        updateEntry.run(item.revisionId, entry.id, item.document.ledger_id, item.revisionId);
        insertRevisionEntry.run(
          stableId("legacy-revision-entry", entry.id),
          item.document.ledger_id,
          item.revisionId,
          entry.id,
          position,
          entry.created_at
        );
      }

      const active = item.outcome === "completed" ? item.revisionId : null;
      const pending = item.outcome === "completed" ? null : item.revisionId;
      updateDocument.run(
        active,
        pending,
        item.document.id,
        item.document.ledger_id,
        active,
        pending
      );
    }
  })();
}

function collectItemDifferences(db, item) {
  const differences = [];
  const revision = db
    .prepare("SELECT * FROM source_document_revisions WHERE id = ? AND ledger_id = ?")
    .get(item.revisionId, item.document.ledger_id);
  if (!revision) {
    differences.push("missing_revision");
    return differences;
  }
  if (
    revision.source_document_id !== item.document.id ||
    revision.revision_number !== 1 ||
    revision.outcome !== item.outcome
  ) {
    differences.push("revision_mapping_mismatch");
  }

  const pointer = db
    .prepare("SELECT active_revision_id, pending_revision_id FROM source_documents WHERE id = ?")
    .get(item.document.id);
  const expectedActive = item.outcome === "completed" ? item.revisionId : null;
  const expectedPending = item.outcome === "completed" ? null : item.revisionId;
  if (
    pointer?.active_revision_id !== expectedActive ||
    pointer?.pending_revision_id !== expectedPending
  ) {
    differences.push("revision_pointer_mismatch");
  }

  for (const file of item.files) {
    const stored = db
      .prepare(
        "SELECT ledger_id, storage_provider, storage_key, content_type, byte_size, original_filename, checksum FROM stored_files WHERE id = ?"
      )
      .get(file.id);
    if (
      !stored ||
      stored.ledger_id !== file.ledgerId ||
      stored.storage_provider !== file.provider ||
      stored.storage_key !== file.key ||
      stored.content_type !== file.contentType ||
      stored.byte_size !== file.byteSize ||
      stored.original_filename !== file.filename ||
      stored.checksum !== file.checksum
    ) {
      differences.push("stored_file_mismatch");
    }
    const relation = db
      .prepare(
        "SELECT 1 FROM revision_files WHERE revision_id = ? AND stored_file_id = ? AND position = ?"
      )
      .get(item.revisionId, file.id, file.position);
    if (!relation) differences.push("revision_file_mismatch");
  }
  const revisionFileCount = Number(
    db
      .prepare("SELECT COUNT(*) AS count FROM revision_files WHERE revision_id = ?")
      .get(item.revisionId).count
  );
  if (revisionFileCount !== item.files.length) differences.push("revision_file_count_mismatch");

  for (let position = 0; position < item.entries.length; position += 1) {
    const entry = item.entries[position];
    if (
      entry.ledger_id !== item.document.ledger_id ||
      !entry.amount ||
      (!entry.currency && entry.currency !== null)
    ) {
      differences.push("entry_fact_mismatch");
    }
    const projection = db
      .prepare("SELECT source_document_revision_id FROM ledger_entries WHERE id = ?")
      .get(entry.id);
    if (!projection || projection.source_document_revision_id !== item.revisionId) {
      differences.push("ledger_projection_mismatch");
    }
    const relation = db
      .prepare(
        "SELECT 1 FROM revision_entries WHERE revision_id = ? AND ledger_entry_id = ? AND position = ?"
      )
      .get(item.revisionId, entry.id, position);
    if (!relation) differences.push("revision_entry_mismatch");
  }
  const revisionEntryCount = Number(
    db
      .prepare("SELECT COUNT(*) AS count FROM revision_entries WHERE revision_id = ?")
      .get(item.revisionId).count
  );
  if (revisionEntryCount !== item.entries.length) differences.push("revision_entry_count_mismatch");

  return differences;
}

function reconcile(db, uploadsPath) {
  const plan = collectPlan(db, uploadsPath);
  const unresolved = new Map(plan.errors);
  const add = (kind, count = 1) => unresolved.set(kind, (unresolved.get(kind) ?? 0) + count);

  for (const item of plan.planned) {
    for (const difference of collectItemDifferences(db, item)) add(difference);
  }

  const deletedTargetRows = Number(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM source_document_revisions r JOIN source_documents d ON d.id = r.source_document_id AND d.ledger_id = r.ledger_id WHERE d.status = 'deleted' OR d.deleted_at IS NOT NULL"
      )
      .get().count
  );
  if (deletedTargetRows > 0) add("deleted_document_target_rows", deletedTargetRows);
  const deletedTargetPointers = Number(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM source_documents WHERE (status = 'deleted' OR deleted_at IS NOT NULL) AND (active_revision_id IS NOT NULL OR pending_revision_id IS NOT NULL)"
      )
      .get().count
  );
  if (deletedTargetPointers > 0) {
    add("deleted_document_target_pointers", deletedTargetPointers);
  }
  const deletedLedgerProjections = Number(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM ledger_entries e JOIN source_documents d ON d.id = e.source_document_id AND d.ledger_id = e.ledger_id WHERE (d.status = 'deleted' OR d.deleted_at IS NOT NULL) AND e.source_document_revision_id IS NOT NULL"
      )
      .get().count
  );
  if (deletedLedgerProjections > 0) {
    add("deleted_document_ledger_projections", deletedLedgerProjections);
  }

  return {
    documents: plan.planned.length,
    excludedDeletedDocuments: plan.excludedDeletedDocuments,
    excludedDeletedTargetRows: {
      revisions: deletedTargetRows,
      pointers: deletedTargetPointers,
      ledgerProjections: deletedLedgerProjections,
    },
    unresolved: Object.fromEntries(unresolved),
    unresolvedCount: [...unresolved.values()].reduce((sum, count) => sum + count, 0),
  };
}

function writeCheckpoint(db, { status, cursor, processedCount, details, now }) {
  db.prepare(
    "INSERT INTO migration_checkpoints (id, migration_name, checkpoint_key, status, cursor, processed_count, details, created_at, updated_at) VALUES (?, ?, 'global', ?, ?, ?, ?, ?, ?) ON CONFLICT(migration_name, checkpoint_key) DO UPDATE SET status = excluded.status, cursor = excluded.cursor, processed_count = excluded.processed_count, details = excluded.details, updated_at = excluded.updated_at"
  ).run(
    stableId("checkpoint", APPLICATION_LAYER_BACKFILL_NAME),
    APPLICATION_LAYER_BACKFILL_NAME,
    status,
    cursor,
    processedCount,
    JSON.stringify(details),
    now,
    now
  );
}

/**
 * @param {{
 *   db: import("better-sqlite3").Database;
 *   uploadsPath: string;
 *   batchSize?: number;
 *   stopAfterBatches?: number | null;
 *   now?: () => number;
 * }} options
 */
export function runApplicationLayerBackfill({
  db,
  uploadsPath,
  batchSize = 100,
  stopAfterBatches = null,
  now = () => Date.now(),
}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("Application-layer backfill batchSize must be an integer between 1 and 1000");
  }

  const resolvedUploadsPath = path.resolve(uploadsPath);
  const plan = collectPlan(db, resolvedUploadsPath);
  const preflight = {
    documents: plan.planned.length,
    excludedDeletedDocuments: plan.excludedDeletedDocuments,
    blockers: Object.fromEntries(plan.errors),
    blockerCount: [...plan.errors.values()].reduce((sum, count) => sum + count, 0),
  };
  if (preflight.blockerCount > 0) {
    throw new Error(
      `Application-layer backfill blocked by ${preflight.blockerCount} unresolved source facts: ${JSON.stringify(preflight.blockers)}`
    );
  }

  // A cursor alone can miss later UUIDs that sort before it. Completeness is the resume source of truth.
  const pending = plan.planned.filter((item) => collectItemDifferences(db, item).length > 0);
  const completeBeforeRun = plan.planned.length - pending.length;
  let batches = 0;
  let appliedDocuments = 0;

  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    applyBatch(db, batch);
    batches += 1;
    appliedDocuments += batch.length;
    const checkpointTime = now();
    writeCheckpoint(db, {
      status: "running",
      cursor: batch.at(-1).document.id,
      processedCount: completeBeforeRun + appliedDocuments,
      details: { batches, excludedDeletedDocuments: plan.excludedDeletedDocuments },
      now: checkpointTime,
    });
    if (stopAfterBatches === batches) {
      throw new Error("Intentional interruption after committed application-layer backfill batch");
    }
  }

  const reconciliation = reconcile(db, resolvedUploadsPath);
  if (reconciliation.unresolvedCount > 0) {
    throw new Error(
      `Application-layer reconciliation blocked by ${reconciliation.unresolvedCount} unresolved differences: ${JSON.stringify(reconciliation.unresolved)}`
    );
  }

  const checkpoint = db
    .prepare(
      "SELECT status, processed_count FROM migration_checkpoints WHERE migration_name = ? AND checkpoint_key = 'global'"
    )
    .get(APPLICATION_LAYER_BACKFILL_NAME);
  if (
    !checkpoint ||
    checkpoint.status !== "completed" ||
    checkpoint.processed_count !== plan.planned.length ||
    appliedDocuments > 0
  ) {
    const checkpointTime = now();
    writeCheckpoint(db, {
      status: "completed",
      cursor: plan.planned.at(-1)?.document.id ?? null,
      processedCount: plan.planned.length,
      details: {
        batches,
        excludedDeletedDocuments: plan.excludedDeletedDocuments,
        unresolvedCount: 0,
      },
      now: checkpointTime,
    });
  }

  return {
    migration: APPLICATION_LAYER_BACKFILL_NAME,
    batches,
    appliedDocuments,
    preflight,
    reconciliation,
  };
}
