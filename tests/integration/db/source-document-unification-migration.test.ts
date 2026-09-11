import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTestPool } from "../../setup";

const migration = readFileSync(
  "src/persistence/postgres-migrations/0040_unify_source_documents.sql",
  "utf8"
);

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("source document unification migration", () => {
  it("backfills live quick-entry titles before removing the document type", async () => {
    const client = await getTestPool().connect();
    const schemaName = `source_unification_${crypto.randomUUID().replaceAll("-", "")}`;
    const schema = quoteIdentifier(schemaName);

    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema}`);
      await client.query(`
        CREATE TYPE source_document_type AS ENUM ('ai_parsed', 'manual');
        CREATE TABLE source_documents (
          id uuid PRIMARY KEY,
          ledger_id uuid NOT NULL,
          title text,
          type source_document_type NOT NULL DEFAULT 'ai_parsed',
          active_revision_id uuid,
          version integer NOT NULL DEFAULT 1,
          updated_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz
        );
        CREATE TABLE source_document_revisions (
          id uuid PRIMARY KEY,
          source_document_id uuid NOT NULL,
          origin text NOT NULL
        );
        CREATE TABLE entry_categories (
          id uuid PRIMARY KEY,
          ledger_id uuid NOT NULL,
          name text NOT NULL
        );
        CREATE TABLE ledger_entries (
          id uuid PRIMARY KEY,
          ledger_id uuid NOT NULL,
          source_document_id uuid NOT NULL,
          source_document_revision_id uuid,
          category_id uuid,
          item_name text NOT NULL,
          position integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz
        );
      `);

      const ledgerId = crypto.randomUUID();
      const changedDocumentId = crypto.randomUUID();
      const unchangedDocumentId = crypto.randomUUID();
      const aiDocumentId = crypto.randomUUID();
      const emptyDocumentId = crypto.randomUUID();
      const deletedDocumentId = crypto.randomUUID();
      const editedDocumentId = crypto.randomUUID();
      const changedRevisionId = crypto.randomUUID();
      const unchangedRevisionId = crypto.randomUUID();
      const aiRevisionId = crypto.randomUUID();
      const deletedRevisionId = crypto.randomUUID();
      const editedRevisionId = crypto.randomUUID();
      const oldCategoryId = crypto.randomUUID();
      const currentCategoryId = crypto.randomUUID();

      await client.query(
        `INSERT INTO source_documents
          (id, ledger_id, title, type, active_revision_id, version, deleted_at)
         VALUES
          ($1, $6, 'Old category', 'manual', $7, 1, NULL),
          ($2, $6, 'Already current', 'manual', $8, 5, NULL),
          ($3, $6, 'AI title', 'ai_parsed', $9, 3, NULL),
          ($4, $6, 'No entries', 'manual', NULL, 4, NULL),
          ($5, $6, 'Deleted title', 'manual', $10, 6, now()),
          ($11, $6, 'User title', 'manual', $12, 7, NULL)`,
        [
          changedDocumentId,
          unchangedDocumentId,
          aiDocumentId,
          emptyDocumentId,
          deletedDocumentId,
          ledgerId,
          changedRevisionId,
          unchangedRevisionId,
          aiRevisionId,
          deletedRevisionId,
          editedDocumentId,
          editedRevisionId,
        ]
      );
      await client.query(
        `INSERT INTO entry_categories (id, ledger_id, name)
         VALUES ($1, $3, 'Old category'), ($2, $3, 'Already current')`,
        [oldCategoryId, currentCategoryId, ledgerId]
      );
      await client.query(
        `INSERT INTO source_document_revisions (id, source_document_id, origin)
         VALUES ($1, $2, 'manual_entry')`,
        [changedRevisionId, changedDocumentId]
      );
      await client.query(
        `INSERT INTO ledger_entries
          (id, ledger_id, source_document_id, source_document_revision_id, category_id, item_name, position)
         VALUES
          ($1, $9, $2, $3, $12, 'Second item', 1),
          ($4, $9, $2, $3, $12, '  First item  ', 0),
          ($5, $9, $6, $7, $13, 'Already current', 0),
          ($8, $9, $10, $11, $12, 'Hidden item', 0),
          ($14, $9, $15, $16, $12, 'Edited item', 0)`,
        [
          crypto.randomUUID(),
          changedDocumentId,
          changedRevisionId,
          crypto.randomUUID(),
          crypto.randomUUID(),
          unchangedDocumentId,
          unchangedRevisionId,
          crypto.randomUUID(),
          ledgerId,
          deletedDocumentId,
          deletedRevisionId,
          oldCategoryId,
          currentCategoryId,
          crypto.randomUUID(),
          editedDocumentId,
          editedRevisionId,
        ]
      );

      const schemaQualifiedMigration = migration.replaceAll('"public".', `${schema}.`);
      for (const statement of schemaQualifiedMigration.split("--> statement-breakpoint")) {
        if (statement.trim() !== "") await client.query(statement);
      }

      const documents = await client.query<{ id: string; title: string; version: number }>(
        `SELECT id, title, version FROM source_documents ORDER BY id`
      );
      const byId = new Map(documents.rows.map((row) => [row.id, row]));
      expect(byId.get(changedDocumentId)).toMatchObject({ title: "First item", version: 2 });
      expect(byId.get(unchangedDocumentId)).toMatchObject({
        title: "Already current",
        version: 5,
      });
      expect(byId.get(aiDocumentId)).toMatchObject({ title: "AI title", version: 3 });
      expect(byId.get(emptyDocumentId)).toMatchObject({ title: "No entries", version: 4 });
      expect(byId.get(deletedDocumentId)).toMatchObject({ title: "Deleted title", version: 6 });
      expect(byId.get(editedDocumentId)).toMatchObject({ title: "User title", version: 7 });

      const revision = await client.query<{ origin: string }>(
        `SELECT origin FROM source_document_revisions WHERE id = $1`,
        [changedRevisionId]
      );
      expect(revision.rows[0]?.origin).toBe("manual_entry");

      const typeColumn = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'source_documents' AND column_name = 'type'`,
        [schemaName]
      );
      expect(typeColumn.rowCount).toBe(0);
      const typeEnum = await client.query(
        `SELECT 1 FROM pg_type type
         JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
         WHERE namespace.nspname = $1 AND type.typname = 'source_document_type'`,
        [schemaName]
      );
      expect(typeEnum.rowCount).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
