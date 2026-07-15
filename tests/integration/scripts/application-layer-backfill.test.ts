import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { runApplicationLayerBackfill } from "../../../scripts/migrations/application-layer-backfill.mjs";

const migrationsFolder = path.resolve("src/persistence/migrations");
const temporaryDirectories: string[] = [];

function createPreExpansionMigrationsFolder(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "cashier-pre-backfill-"));
  temporaryDirectories.push(folder);
  const metaFolder = path.join(folder, "meta");
  mkdirSync(metaFolder);

  for (const entry of readdirSync(migrationsFolder)) {
    if (entry.endsWith(".sql") && Number(entry.slice(0, 4)) < 35) {
      copyFileSync(path.join(migrationsFolder, entry), path.join(folder, entry));
    }
  }

  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")
  ) as { entries: Array<{ tag: string }> };
  journal.entries = journal.entries.filter((entry) => Number(entry.tag.slice(0, 4)) < 35);
  writeFileSync(path.join(metaFolder, "_journal.json"), JSON.stringify(journal));
  return folder;
}

function runDatabaseMigrations(databasePath: string, uploadsPath: string) {
  return spawnSync(process.execPath, ["scripts/migrate-database.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: `file:${databasePath}`,
      LOCAL_STORAGE_PATH: uploadsPath,
    },
  });
}

function expectSuccessfulMigration(databasePath: string, uploadsPath: string) {
  const result = runDatabaseMigrations(databasePath, uploadsPath);
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    mode: string;
    schemaMigrations: string;
    backfill: {
      batches: number;
      appliedDocuments: number;
      preflight: { documents: number; excludedDeletedDocuments: number };
      reconciliation: {
        excludedDeletedTargetRows: {
          revisions: number;
          pointers: number;
          ledgerProjections: number;
        };
        unresolvedCount: number;
      };
    };
  };
}

async function createFixture({ expanded = false }: { expanded?: boolean } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "cashier-backfill-"));
  temporaryDirectories.push(root);
  const databasePath = path.join(root, "sqlite.db");
  const uploadsPath = path.join(root, "uploads");
  const client = new Database(databasePath);
  await migrate(drizzle(client), {
    migrationsFolder: expanded ? migrationsFolder : createPreExpansionMigrationsFolder(),
  });
  client.exec(`
    INSERT INTO users (id, email, created_at, updated_at) VALUES ('user-1', 'backfill@example.com', 1, 1);
    INSERT INTO ledgers (id, user_id, metadata, created_at, updated_at) VALUES ('ledger-1', 'user-1', '{}', 1, 1);
    INSERT INTO source_documents (id, ledger_id, text, image_urls, status, type, metadata, created_at, updated_at) VALUES
      ('completed-doc', 'ledger-1', 'receipt text', '["/api/uploads/ledger-1/completed-doc/receipt.jpg"]', 'completed', 'ai_parsed', '{}', 10, 20),
      ('queued-doc', 'ledger-1', NULL, '[]', 'queued', 'ai_parsed', '{}', 11, 21),
      ('anomaly-doc', 'ledger-1', 'ambiguous', '[]', 'anomaly', 'ai_parsed', '{}', 12, 22),
      ('deleted-doc', 'ledger-1', NULL, '["/api/uploads/ledger-1/deleted-doc/deleted.jpg"]', 'deleted', 'ai_parsed', '{}', 13, 23);
    INSERT INTO ledger_entries (id, ledger_id, source_document_id, amount, currency, item_name, description, exchange_rate, converted_amount, created_at, updated_at, deleted_at) VALUES
      ('entry-1', 'ledger-1', 'completed-doc', '12.50', 'CNY', 'Lunch', 'Legacy entry', '1', '12.50', 15, 20, NULL),
      ('entry-2', 'ledger-1', 'deleted-doc', '7.00', 'CNY', 'Deleted lunch', NULL, '1', '7.00', 16, 23, 23);
    INSERT INTO task_runs (id, type, title, entity_type, entity_id, status, created_at, updated_at) VALUES
      ('task-1', 'parse_source_document', 'Queued parse', 'source_document', 'queued-doc', 'running', 11, 21);
  `);
  client.close();

  const completedDirectory = path.join(uploadsPath, "ledger-1", "completed-doc");
  const deletedDirectory = path.join(uploadsPath, "ledger-1", "deleted-doc");
  mkdirSync(completedDirectory, { recursive: true });
  mkdirSync(deletedDirectory, { recursive: true });
  const completedFilePath = path.join(completedDirectory, "receipt.jpg");
  const deletedFilePath = path.join(deletedDirectory, "deleted.jpg");
  writeFileSync(completedFilePath, "receipt-bytes");
  writeFileSync(deletedFilePath, "deleted-recovery-bytes");
  return { databasePath, uploadsPath, completedFilePath, deletedFilePath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("automatic application-layer database migration", () => {
  it("runs schema migration and backfill before startup, then performs zero writes on restart", async () => {
    const fixture = await createFixture();
    const completedBytes = readFileSync(fixture.completedFilePath);
    const deletedBytes = readFileSync(fixture.deletedFilePath);
    const before = new Database(fixture.databasePath, { readonly: true });
    const deletedDocumentBefore = before
      .prepare(
        "SELECT id, ledger_id, text, image_urls, status, type, title, entry_date, metadata, anomaly_reason, created_at, updated_at, deleted_at FROM source_documents WHERE id = 'deleted-doc'"
      )
      .get();
    const deletedEntryBefore = before
      .prepare(
        "SELECT id, ledger_id, category_id, source_document_id, amount, currency, item_name, description, converted_amount, exchange_rate, created_at, updated_at, deleted_at FROM ledger_entries WHERE id = 'entry-2'"
      )
      .get();
    before.close();

    const first = expectSuccessfulMigration(fixture.databasePath, fixture.uploadsPath);
    expect(first).toMatchObject({
      mode: "migrate",
      schemaMigrations: "complete",
      backfill: {
        batches: 1,
        appliedDocuments: 3,
        preflight: { documents: 3, excludedDeletedDocuments: 1 },
        reconciliation: {
          excludedDeletedTargetRows: { revisions: 0, pointers: 0, ledgerProjections: 0 },
          unresolvedCount: 0,
        },
      },
    });

    const db = new Database(fixture.databasePath);
    expect(db.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({
      count: 38,
    });
    expect(db.prepare("SELECT count(*) AS count FROM source_document_revisions").get()).toEqual({
      count: 3,
    });
    expect(db.prepare("SELECT count(*) AS count FROM stored_files").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT count(*) AS count FROM revision_entries").get()).toEqual({
      count: 1,
    });
    expect(
      db
        .prepare(
          "SELECT active_revision_id, pending_revision_id, updated_at FROM source_documents WHERE id = 'completed-doc'"
        )
        .get()
    ).toEqual({
      active_revision_id: expect.any(String),
      pending_revision_id: null,
      updated_at: 20,
    });
    expect(
      db
        .prepare(
          "SELECT active_revision_id, pending_revision_id FROM source_documents WHERE id = 'queued-doc'"
        )
        .get()
    ).toEqual({ active_revision_id: null, pending_revision_id: expect.any(String) });
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM source_document_revisions WHERE source_document_id = 'deleted-doc'"
        )
        .get()
    ).toEqual({ count: 0 });
    expect(
      db
        .prepare(
          "SELECT id, ledger_id, text, image_urls, status, type, title, entry_date, metadata, anomaly_reason, created_at, updated_at, deleted_at FROM source_documents WHERE id = 'deleted-doc'"
        )
        .get()
    ).toEqual(deletedDocumentBefore);
    expect(
      db
        .prepare(
          "SELECT id, ledger_id, category_id, source_document_id, amount, currency, item_name, description, converted_amount, exchange_rate, created_at, updated_at, deleted_at FROM ledger_entries WHERE id = 'entry-2'"
        )
        .get()
    ).toEqual(deletedEntryBefore);
    const checkpointBeforeRestart = db
      .prepare(
        "SELECT status, cursor, processed_count, details, created_at, updated_at FROM migration_checkpoints WHERE migration_name = 'application-layer-backfill-v1'"
      )
      .get();
    db.close();

    const second = expectSuccessfulMigration(fixture.databasePath, fixture.uploadsPath);
    expect(second.backfill).toMatchObject({
      batches: 0,
      appliedDocuments: 0,
      reconciliation: { unresolvedCount: 0 },
    });
    const restarted = new Database(fixture.databasePath, { readonly: true });
    expect(
      restarted
        .prepare(
          "SELECT status, cursor, processed_count, details, created_at, updated_at FROM migration_checkpoints WHERE migration_name = 'application-layer-backfill-v1'"
        )
        .get()
    ).toEqual(checkpointBeforeRestart);
    restarted.close();
    expect(readFileSync(fixture.completedFilePath)).toEqual(completedBytes);
    expect(readFileSync(fixture.deletedFilePath)).toEqual(deletedBytes);
  });

  it("finds a later legacy document even when its id sorts before the old cursor", async () => {
    const fixture = await createFixture();
    expectSuccessfulMigration(fixture.databasePath, fixture.uploadsPath);
    const db = new Database(fixture.databasePath);
    db.prepare(
      "INSERT INTO source_documents (id, ledger_id, text, image_urls, status, type, metadata, created_at, updated_at) VALUES (?, ?, ?, '[]', 'completed', 'manual', '{}', ?, ?)"
    ).run("000-late-document", "ledger-1", "late entry", 30, 30);
    db.close();

    const rerun = expectSuccessfulMigration(fixture.databasePath, fixture.uploadsPath);
    expect(rerun.backfill).toMatchObject({
      batches: 1,
      appliedDocuments: 1,
      preflight: { documents: 4, excludedDeletedDocuments: 1 },
      reconciliation: { unresolvedCount: 0 },
    });
    const verify = new Database(fixture.databasePath, { readonly: true });
    expect(
      verify
        .prepare(
          "SELECT count(*) AS count FROM source_document_revisions WHERE source_document_id = '000-late-document'"
        )
        .get()
    ).toEqual({ count: 1 });
    verify.close();
  });

  it("resumes from completed mappings after an interrupted batch", async () => {
    const fixture = await createFixture({ expanded: true });
    const interrupted = new Database(fixture.databasePath);
    interrupted.pragma("foreign_keys = ON");
    expect(() =>
      runApplicationLayerBackfill({
        db: interrupted,
        uploadsPath: fixture.uploadsPath,
        batchSize: 1,
        stopAfterBatches: 1,
      })
    ).toThrow(/Intentional interruption/);
    interrupted.close();

    const resumed = new Database(fixture.databasePath);
    resumed.pragma("foreign_keys = ON");
    const result = runApplicationLayerBackfill({
      db: resumed,
      uploadsPath: fixture.uploadsPath,
      batchSize: 1,
    });
    expect(result).toMatchObject({
      batches: 2,
      appliedDocuments: 2,
      reconciliation: { unresolvedCount: 0 },
    });
    expect(
      resumed
        .prepare(
          "SELECT status, processed_count FROM migration_checkpoints WHERE migration_name = 'application-layer-backfill-v1'"
        )
        .get()
    ).toEqual({ status: "completed", processed_count: 3 });
    resumed.close();
  });

  it("applies additive schema but blocks application startup before target writes on malformed source data", async () => {
    const fixture = await createFixture();
    const db = new Database(fixture.databasePath);
    db.prepare("UPDATE source_documents SET image_urls = ? WHERE id = 'completed-doc'").run(
      "not-json"
    );
    db.close();

    const result = runDatabaseMigrations(fixture.databasePath, fixture.uploadsPath);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Application-layer backfill blocked");
    const verify = new Database(fixture.databasePath, { readonly: true });
    expect(verify.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({
      count: 38,
    });
    expect(verify.prepare("SELECT count(*) AS count FROM source_document_revisions").get()).toEqual(
      {
        count: 0,
      }
    );
    verify.close();
  });
});
