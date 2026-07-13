import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

function runScript(script: string, args: string[]) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("production data operations", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function createFixture() {
    const root = mkdtempSync(path.join(tmpdir(), "cashier-production-ops-"));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, "sqlite.db");
    const uploadsPath = path.join(root, "uploads");
    mkdirSync(path.join(uploadsPath, "ledger-1", "doc-1"), { recursive: true });
    writeFileSync(path.join(uploadsPath, "ledger-1", "doc-1", "known.jpg"), "known-bytes");
    writeFileSync(path.join(uploadsPath, "orphan.bin"), "orphan-bytes");

    const database = new Database(databasePath);
    database.exec(`
      CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at INTEGER);
      CREATE TABLE source_documents (
        id TEXT PRIMARY KEY,
        ledger_id TEXT NOT NULL,
        text TEXT,
        image_urls TEXT,
        status TEXT NOT NULL,
        type TEXT NOT NULL,
        anomaly_reason TEXT,
        deleted_at INTEGER
      );
      CREATE TABLE task_runs (id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE ledger_entries (id TEXT PRIMARY KEY);
      INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('hash', 1234);
      INSERT INTO source_documents VALUES
        ('doc-1', 'ledger-1', 'private receipt content',
         '["/api/uploads/ledger-1/doc-1/known.jpg","/api/uploads/ledger-1/doc-1/missing.jpg","https://private.example/image.jpg"]',
         'completed', 'ai_parsed', NULL, NULL),
        ('doc-2', 'ledger-1', 'another private receipt', 'malformed private image data',
         'anomaly', 'manual', 'private anomaly', NULL);
      INSERT INTO task_runs VALUES
        ('task-1', 'categorize_entry', 'pending'),
        ('task-2', 'parse_source_document', 'failed');
    `);
    database.close();
    return { root, databasePath, uploadsPath };
  }

  it("reports aggregate inventory without exposing content, keys, or filesystem paths", () => {
    const fixture = createFixture();
    const output = runScript("scripts/production-inventory.mjs", [
      "--database",
      fixture.databasePath,
      "--uploads",
      fixture.uploadsPath,
    ]);
    const report = JSON.parse(output);

    expect(report.integrity).toEqual({ quickCheck: "ok", foreignKeyViolations: 0 });
    expect(report.schema.appliedMigrations).toBe(1);
    expect(report.tableCounts.source_documents).toBe(2);
    expect(report.sourceDocuments.states).toEqual({ anomaly: 1, completed: 1 });
    expect(report.sourceDocuments.images).toMatchObject({
      rowsWithMalformedImageData: 1,
      totalReferences: 3,
      localReferences: 2,
      remoteReferences: 1,
      missingLocalReferences: 1,
      unreferencedLocalFiles: 1,
    });
    expect(report.tasks).toMatchObject({
      states: { failed: 1, pending: 1 },
      retiredActiveTasks: 1,
    });
    expect(report.localFiles).toMatchObject({ files: 2, bytes: 23, symlinks: 0 });
    expect(output).not.toContain("private receipt content");
    expect(output).not.toContain("known.jpg");
    expect(output).not.toContain(fixture.root);

    const database = new Database(fixture.databasePath, { readonly: true });
    expect(database.prepare("SELECT COUNT(*) AS count FROM source_documents").get()).toEqual({
      count: 2,
    });
    database.close();
  });

  it("captures a frozen database/upload set and verifies the restore copy", () => {
    const fixture = createFixture();
    const backupPath = path.join(fixture.root, "backup");
    const backupOutput = runScript("scripts/coordinated-backup.mjs", [
      "--database",
      fixture.databasePath,
      "--uploads",
      fixture.uploadsPath,
      "--destination",
      backupPath,
      "--write-freeze-confirmed",
    ]);
    expect(JSON.parse(backupOutput)).toMatchObject({
      databaseFiles: 1,
      uploadFiles: 2,
      uploadBytes: 23,
    });

    const manifest = JSON.parse(readFileSync(path.join(backupPath, "manifest.json"), "utf8"));
    expect(manifest.writeFreezeConfirmed).toBe(true);
    expect(manifest.database.files).toHaveLength(1);
    expect(manifest.uploads.files).toHaveLength(2);

    const verifyOutput = runScript("scripts/verify-coordinated-backup.mjs", [
      "--backup",
      backupPath,
    ]);
    expect(JSON.parse(verifyOutput)).toMatchObject({
      checksums: "ok",
      verifiedFiles: 3,
      databaseQuickCheck: "ok",
      foreignKeyViolations: 0,
      sourceDocumentRows: 2,
      localFiles: 2,
      missingLocalReferences: 1,
    });
  });
});
