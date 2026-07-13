import Database from "better-sqlite3";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";

const SOURCE_DOCUMENT_STATUSES = new Set([
  "queued",
  "processing",
  "completed",
  "anomaly",
  "failed",
  "deleted",
]);
const SOURCE_DOCUMENT_TYPES = new Set(["ai_parsed", "manual"]);
const TASK_STATUSES = new Set(["pending", "running", "completed", "failed", "cancelled"]);
const RETIRED_TASK_TYPES = new Set(["categorize_entry", "generate_category_metadata"]);
const LOCAL_UPLOAD_PREFIX = "/api/uploads/";

export function resolveDatabasePath(value, cwd = process.cwd()) {
  if (value === ":memory:" || value === "file::memory:") {
    throw new Error("Inventory requires a file-backed SQLite database");
  }

  const withoutPrefix = value.startsWith("file:") ? value.slice("file:".length) : value;
  const queryIndex = withoutPrefix.indexOf("?");
  const rawPath = queryIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, queryIndex);
  if (rawPath === "") {
    throw new Error("SQLite database path is empty");
  }
  return path.resolve(cwd, rawPath);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeGroupedRows(rows, allowedValues) {
  const result = {};
  for (const row of rows) {
    const key = typeof row.value === "string" && allowedValues.has(row.value) ? row.value : "other";
    result[key] = (result[key] ?? 0) + Number(row.count);
  }
  return result;
}

function scanLocalFiles(rootPath) {
  const files = new Set();
  const totals = { files: 0, bytes: 0, symlinks: 0, otherEntries: 0 };
  if (!existsSync(rootPath)) {
    return { exists: false, files, totals };
  }

  const visit = (directory, relativeDirectory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const stat = lstatSync(absolutePath);
        files.add(relativePath);
        totals.files += 1;
        totals.bytes += stat.size;
      } else if (entry.isSymbolicLink()) {
        totals.symlinks += 1;
      } else {
        totals.otherEntries += 1;
      }
    }
  };

  visit(rootPath, "");
  return { exists: true, files, totals };
}

function extractSafeLocalKey(url) {
  const withoutQuery = url.split("?", 1)[0] ?? "";
  const withoutFragment = withoutQuery.split("#", 1)[0] ?? "";
  if (!withoutFragment.startsWith(LOCAL_UPLOAD_PREFIX)) return null;

  const key = withoutFragment.slice(LOCAL_UPLOAD_PREFIX.length);
  if (key === "" || key.startsWith("/") || key.includes("\\") || key.includes("..")) {
    return "";
  }
  return key.split("/").filter(Boolean).join("/");
}

function collectImageReferenceInventory(db, localFiles) {
  const result = {
    rowsWithMalformedImageData: 0,
    totalReferences: 0,
    localReferences: 0,
    uniqueLocalReferences: 0,
    remoteReferences: 0,
    invalidReferences: 0,
    missingLocalReferences: 0,
    unreferencedLocalFiles: 0,
  };
  const uniqueLocalKeys = new Set();
  const rows = db.prepare("SELECT image_urls AS imageUrls FROM source_documents").all();

  for (const row of rows) {
    let references;
    try {
      references = typeof row.imageUrls === "string" ? JSON.parse(row.imageUrls) : row.imageUrls;
    } catch {
      result.rowsWithMalformedImageData += 1;
      continue;
    }
    if (!Array.isArray(references)) {
      result.rowsWithMalformedImageData += 1;
      continue;
    }

    for (const reference of references) {
      if (typeof reference !== "string" || reference === "") {
        result.invalidReferences += 1;
        continue;
      }
      result.totalReferences += 1;
      const localKey = extractSafeLocalKey(reference);
      if (localKey === null) {
        result.remoteReferences += 1;
      } else if (localKey === "") {
        result.invalidReferences += 1;
      } else {
        result.localReferences += 1;
        uniqueLocalKeys.add(localKey);
        if (!localFiles.has(localKey)) result.missingLocalReferences += 1;
      }
    }
  }

  result.uniqueLocalReferences = uniqueLocalKeys.size;
  let referencedLocalFiles = 0;
  for (const key of uniqueLocalKeys) {
    if (localFiles.has(key)) referencedLocalFiles += 1;
  }
  result.unreferencedLocalFiles = Math.max(0, localFiles.size - referencedLocalFiles);
  return result;
}

export function collectProductionInventory({ databasePath, uploadsPath }) {
  const resolvedDatabasePath = resolveDatabasePath(databasePath);
  const resolvedUploadsPath = path.resolve(uploadsPath);
  const storage = scanLocalFiles(resolvedUploadsPath);
  const db = new Database(resolvedDatabasePath, { readonly: true, fileMustExist: true });

  try {
    db.pragma("query_only = ON");
    const quickCheck = db.pragma("quick_check", { simple: true });
    const foreignKeyViolations = db.pragma("foreign_key_check").length;
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((row) => row.name)
      .filter((name) => typeof name === "string");
    const tableSet = new Set(tables);
    const tableCounts = {};
    for (const table of tables) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get();
      tableCounts[table] = Number(row?.count ?? 0);
    }

    const migrations = tableSet.has("__drizzle_migrations")
      ? db
          .prepare(
            "SELECT COUNT(*) AS count, MAX(created_at) AS latestCreatedAt FROM __drizzle_migrations"
          )
          .get()
      : null;
    const sourceDocuments = tableSet.has("source_documents")
      ? {
          states: normalizeGroupedRows(
            db
              .prepare(
                "SELECT status AS value, COUNT(*) AS count FROM source_documents GROUP BY status"
              )
              .all(),
            SOURCE_DOCUMENT_STATUSES
          ),
          types: normalizeGroupedRows(
            db
              .prepare(
                "SELECT type AS value, COUNT(*) AS count FROM source_documents GROUP BY type"
              )
              .all(),
            SOURCE_DOCUMENT_TYPES
          ),
          activeRows: Number(
            db
              .prepare("SELECT COUNT(*) AS count FROM source_documents WHERE deleted_at IS NULL")
              .get()?.count ?? 0
          ),
          deletedRows: Number(
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM source_documents WHERE deleted_at IS NOT NULL"
              )
              .get()?.count ?? 0
          ),
          anomalyRows: Number(
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM source_documents WHERE status = 'anomaly' OR anomaly_reason IS NOT NULL"
              )
              .get()?.count ?? 0
          ),
          images: collectImageReferenceInventory(db, storage.files),
        }
      : null;
    const taskRows = tableSet.has("task_runs")
      ? db.prepare("SELECT status AS value, COUNT(*) AS count FROM task_runs GROUP BY status").all()
      : [];
    const retiredTaskRows = tableSet.has("task_runs")
      ? db
          .prepare(
            "SELECT type, status, COUNT(*) AS count FROM task_runs WHERE type IN ('categorize_entry', 'generate_category_metadata') GROUP BY type, status"
          )
          .all()
      : [];
    let retiredActiveTasks = 0;
    let retiredHistoricalTasks = 0;
    for (const row of retiredTaskRows) {
      if (!RETIRED_TASK_TYPES.has(row.type)) continue;
      const count = Number(row.count);
      if (row.status === "pending" || row.status === "running") retiredActiveTasks += count;
      else retiredHistoricalTasks += count;
    }

    return {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      integrity: {
        quickCheck: quickCheck === "ok" ? "ok" : "failed",
        foreignKeyViolations,
      },
      schema: {
        userVersion: Number(db.pragma("user_version", { simple: true }) ?? 0),
        appliedMigrations: Number(migrations?.count ?? 0),
        latestMigrationCreatedAt:
          migrations?.latestCreatedAt == null ? null : Number(migrations.latestCreatedAt),
      },
      tableCounts,
      sourceDocuments,
      tasks: tableSet.has("task_runs")
        ? {
            states: normalizeGroupedRows(taskRows, TASK_STATUSES),
            retiredActiveTasks,
            retiredHistoricalTasks,
          }
        : null,
      localFiles: {
        rootExists: storage.exists,
        ...storage.totals,
      },
    };
  } finally {
    db.close();
  }
}
