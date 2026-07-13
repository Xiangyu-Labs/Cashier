import { afterEach, describe, expect, it } from "vitest";
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
import * as schema from "@/persistence";
import {
  assertLedgerProjectionRevision,
  assertSourceDocumentRevisionPointers,
} from "@/persistence";

const migrationsFolder = path.resolve("src/persistence/migrations");
const tempFolders: string[] = [];

function createPreExpansionMigrationsFolder(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "cashier-pre-expansion-"));
  tempFolders.push(folder);
  const metaFolder = path.join(folder, "meta");
  const sourceMetaFolder = path.join(migrationsFolder, "meta");
  mkdirSync(metaFolder);

  for (const entry of readdirSync(migrationsFolder)) {
    if (entry.endsWith(".sql") && !entry.startsWith("0035_")) {
      copyFileSync(path.join(migrationsFolder, entry), path.join(folder, entry));
    }
  }

  const journal = JSON.parse(readFileSync(path.join(sourceMetaFolder, "_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  journal.entries = journal.entries.filter((entry) => !entry.tag.startsWith("0035_"));
  writeFileSync(path.join(metaFolder, "_journal.json"), JSON.stringify(journal));
  return folder;
}

function openDatabase() {
  const client = new Database(":memory:");
  client.pragma("foreign_keys = ON");
  return { client, db: drizzle(client, { schema }) };
}

afterEach(() => {
  for (const folder of tempFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("additive application-layer expansion migration", () => {
  it("initializes an empty database with the target tables and indexes", async () => {
    const { client, db } = openDatabase();
    try {
      await migrate(db, { migrationsFolder });

      const tableNames = client
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(tableNames).toEqual(
        expect.arrayContaining([
          "source_document_revisions",
          "stored_files",
          "revision_files",
          "revision_entries",
          "processing_attempts",
          "processing_outbox",
          "upload_sessions",
          "upload_session_files",
          "migration_checkpoints",
        ])
      );
      expect(
        client
          .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
          .get("idx_processing_outbox_dispatch")
      ).toBeDefined();
    } finally {
      client.close();
    }
  });

  it("upgrades the complete supported pre-expansion migration chain without backfilling legacy rows", async () => {
    const { client, db } = openDatabase();
    try {
      await migrate(db, { migrationsFolder: createPreExpansionMigrationsFolder() });
      client.exec(`
        INSERT INTO users (id, email, created_at, updated_at)
        VALUES ('user-1', 'migration@example.com', 1, 1);
        INSERT INTO ledgers (id, user_id, metadata, created_at, updated_at)
        VALUES ('ledger-1', 'user-1', '{}', 1, 1);
        INSERT INTO source_documents
          (id, ledger_id, text, image_urls, status, type, metadata, created_at, updated_at)
        VALUES ('document-1', 'ledger-1', 'legacy evidence', '[]', 'completed', 'ai_parsed', '{}', 1, 1);
        INSERT INTO ledger_entries
          (id, ledger_id, source_document_id, amount, item_name, created_at, updated_at)
        VALUES ('entry-1', 'ledger-1', 'document-1', '12.50', 'legacy entry', 1, 1);
        INSERT INTO task_runs (id, type, title, status, created_at, updated_at)
        VALUES ('task-1', 'parse_source_document', 'Legacy parse', 'completed', 1, 1);
      `);

      await migrate(db, { migrationsFolder });

      expect(
        client
          .prepare(
            "SELECT active_revision_id, pending_revision_id, image_urls FROM source_documents WHERE id = ?"
          )
          .get("document-1")
      ).toEqual({ active_revision_id: null, pending_revision_id: null, image_urls: "[]" });
      expect(
        client
          .prepare("SELECT source_document_id, source_document_revision_id FROM ledger_entries WHERE id = ?")
          .get("entry-1")
      ).toEqual({ source_document_id: "document-1", source_document_revision_id: null });
      expect(client.prepare("SELECT status FROM task_runs WHERE id = ?").get("task-1")).toEqual({
        status: "completed",
      });
      expect(client.prepare("SELECT count(*) AS count FROM source_document_revisions").get()).toEqual({
        count: 0,
      });

      const firstJournal = client
        .prepare("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at")
        .all();
      await migrate(db, { migrationsFolder });
      expect(
        client.prepare("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at").all()
      ).toEqual(firstJournal);
      expect(firstJournal).toHaveLength(36);
    } finally {
      client.close();
    }
  });

  it("enforces SQLite-expressible same-ledger and uniqueness constraints", async () => {
    const { client, db } = openDatabase();
    try {
      await migrate(db, { migrationsFolder });
      client.exec(`
        INSERT INTO users (id, email, created_at, updated_at) VALUES ('user-1', 'one@example.com', 1, 1);
        INSERT INTO users (id, email, created_at, updated_at) VALUES ('user-2', 'two@example.com', 1, 1);
        INSERT INTO ledgers (id, user_id, metadata, created_at, updated_at) VALUES ('ledger-1', 'user-1', '{}', 1, 1);
        INSERT INTO ledgers (id, user_id, metadata, created_at, updated_at) VALUES ('ledger-2', 'user-2', '{}', 1, 1);
        INSERT INTO source_documents (id, ledger_id, image_urls, status, type, metadata, created_at, updated_at)
          VALUES ('document-1', 'ledger-1', '[]', 'queued', 'ai_parsed', '{}', 1, 1);
        INSERT INTO source_document_revisions
          (id, ledger_id, source_document_id, revision_number, outcome, submitted_at, created_at)
          VALUES ('revision-1', 'ledger-1', 'document-1', 1, 'queued', 1, 1);
        INSERT INTO stored_files
          (id, ledger_id, storage_provider, storage_key, content_type, byte_size, created_at)
          VALUES ('file-2', 'ledger-2', 'local', 'ledger-2/file-2', 'image/png', 10, 1);
      `);

      expect(() =>
        client
          .prepare(
            "INSERT INTO revision_files (id, ledger_id, revision_id, stored_file_id, position, created_at) VALUES (?, ?, ?, ?, ?, ?)"
          )
          .run("bad-file-link", "ledger-1", "revision-1", "file-2", 0, 1)
      ).toThrow(/FOREIGN KEY constraint failed/);
      expect(() =>
        client
          .prepare(
            "INSERT INTO source_document_revisions (id, ledger_id, source_document_id, revision_number, outcome, submitted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .run("revision-duplicate", "ledger-1", "document-1", 1, "queued", 1, 1)
      ).toThrow(/UNIQUE constraint failed/);
    } finally {
      client.close();
    }
  });

  it("defines transaction checks for pointer and projection invariants SQLite cannot express", () => {
    const completed = {
      id: "revision-1",
      ledgerId: "ledger-1",
      sourceDocumentId: "document-1",
      outcome: "completed" as const,
    };
    assertSourceDocumentRevisionPointers({
      ledgerId: "ledger-1",
      sourceDocumentId: "document-1",
      activeRevision: completed,
      pendingRevision: null,
    });
    assertLedgerProjectionRevision({
      ledgerId: "ledger-1",
      sourceDocumentId: "document-1",
      revision: completed,
    });
    expect(() =>
      assertSourceDocumentRevisionPointers({
        ledgerId: "ledger-2",
        sourceDocumentId: "document-1",
        activeRevision: completed,
        pendingRevision: null,
      })
    ).toThrow(/same ledger/);
    expect(() =>
      assertLedgerProjectionRevision({
        ledgerId: "ledger-1",
        sourceDocumentId: "other-document",
        revision: completed,
      })
    ).toThrow(/source document and ledger/);
  });
});
