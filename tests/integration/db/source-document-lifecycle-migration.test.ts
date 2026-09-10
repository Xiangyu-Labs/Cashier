import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTestPool } from "../../setup";

const migration = readFileSync(
  "src/persistence/postgres-migrations/0038_source_document_lifecycle.sql",
  "utf8"
);

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describe("source document lifecycle migration", () => {
  it("preserves active results and recovers historical submission input", async () => {
    const client = await getTestPool().connect();
    const schemaName = `lifecycle_migration_${crypto.randomUUID().replaceAll("-", "")}`;
    const schema = quoteIdentifier(schemaName);

    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET LOCAL search_path TO ${schema}`);
      await client.query(`
        CREATE TYPE revision_outcome AS ENUM
          ('processing', 'completed', 'invalid', 'failed', 'cancelled', 'abandoned');
        CREATE TYPE source_document_status AS ENUM
          ('processing', 'completed', 'invalid', 'failed', 'cancelled', 'candidate_pending');
        CREATE TABLE source_documents (
          id uuid PRIMARY KEY,
          ledger_id uuid NOT NULL,
          title text,
          type text NOT NULL DEFAULT 'ai_parsed',
          entry_date date,
          effective_date date GENERATED ALWAYS AS
            (COALESCE(entry_date, (created_at AT TIME ZONE 'UTC')::date)) STORED,
          active_revision_id uuid,
          pending_revision_id uuid,
          state_version integer NOT NULL DEFAULT 1,
          current_status source_document_status NOT NULL DEFAULT 'processing',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz,
          CONSTRAINT source_documents_state_version_check CHECK (state_version > 0),
          CONSTRAINT uq_source_documents_ledger_id_id UNIQUE (ledger_id, id)
        );
        CREATE TABLE source_document_revisions (
          id uuid PRIMARY KEY,
          ledger_id uuid NOT NULL,
          source_document_id uuid NOT NULL,
          revision_number integer NOT NULL,
          title text,
          submitted_text text,
          outcome revision_outcome NOT NULL,
          invalid_reason text,
          failure_code text,
          submitted_at timestamptz NOT NULL DEFAULT now(),
          finalized_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_source_document_revisions_ledger_document_id
            UNIQUE (ledger_id, source_document_id, id)
        );
        CREATE TABLE processing_attempts (revision_id uuid NOT NULL);
        CREATE TABLE processing_outbox (revision_id uuid NOT NULL);
        CREATE INDEX idx_source_documents_active_status_feed
          ON source_documents (ledger_id, current_status, effective_date DESC, created_at DESC, id DESC);
        CREATE INDEX idx_source_documents_pending_revision ON source_documents (pending_revision_id);
        CREATE INDEX idx_source_documents_ledger_entry_date
          ON source_documents (ledger_id, entry_date, created_at DESC, id DESC);
        CREATE INDEX idx_source_document_revisions_ledger_outcome
          ON source_document_revisions (ledger_id, outcome);
      `);

      const candidateDocument = crypto.randomUUID();
      const activeRevision = crypto.randomUUID();
      const candidateRevision = crypto.randomUUID();
      const cancelledDocument = crypto.randomUUID();
      const cancelledRevision = crypto.randomUUID();
      const invalidDocument = crypto.randomUUID();
      const invalidRevision = crypto.randomUUID();
      const manualDocument = crypto.randomUUID();
      const manualRevision = crypto.randomUUID();
      const ledgerId = crypto.randomUUID();

      await client.query(
        `INSERT INTO source_documents
          (id, ledger_id, type, entry_date, active_revision_id, pending_revision_id, current_status)
         VALUES
          ($1, $9, 'ai_parsed', '2026-07-01', $2, $3, 'candidate_pending'),
          ($4, $9, 'ai_parsed', '2026-07-02', NULL, $5, 'cancelled'),
          ($6, $9, 'ai_parsed', '2026-07-03', NULL, $7, 'invalid'),
          ($8, $9, 'manual', '2026-07-04', $10, NULL, 'completed')`,
        [
          candidateDocument,
          activeRevision,
          candidateRevision,
          cancelledDocument,
          cancelledRevision,
          invalidDocument,
          invalidRevision,
          manualDocument,
          ledgerId,
          manualRevision,
        ]
      );
      await client.query(
        `INSERT INTO source_document_revisions
          (id, ledger_id, source_document_id, revision_number, submitted_text, outcome, invalid_reason)
         VALUES
          ($1, $9, $2, 1, 'original input', 'completed', NULL),
          ($3, $9, $2, 2, 'candidate input', 'completed', NULL),
          ($4, $9, $5, 1, 'cancelled input', 'abandoned', NULL),
          ($6, $9, $7, 1, 'invalid input', 'invalid', 'unreadable'),
          ($8, $9, $10, 1, NULL, 'completed', NULL)`,
        [
          activeRevision,
          candidateDocument,
          candidateRevision,
          cancelledRevision,
          cancelledDocument,
          invalidRevision,
          invalidDocument,
          manualRevision,
          ledgerId,
          manualDocument,
        ]
      );
      await client.query("INSERT INTO processing_attempts (revision_id) VALUES ($1), ($2)", [
        activeRevision,
        candidateRevision,
      ]);
      await client.query(`
        ALTER TABLE source_documents ADD CONSTRAINT fk_source_documents_pending_revision
          FOREIGN KEY (ledger_id, id, pending_revision_id)
          REFERENCES source_document_revisions (ledger_id, source_document_id, id)
      `);

      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim() !== "") await client.query(statement);
      }

      const documents = await client.query<{
        id: string;
        active_revision_id: string | null;
        latest_submission_revision_id: string | null;
      }>(`SELECT id, active_revision_id, latest_submission_revision_id FROM source_documents`);
      const byDocument = new Map(documents.rows.map((row) => [row.id, row]));
      expect(byDocument.get(candidateDocument)).toMatchObject({
        active_revision_id: activeRevision,
        latest_submission_revision_id: candidateRevision,
      });
      expect(byDocument.get(cancelledDocument)?.latest_submission_revision_id).toBe(
        cancelledRevision
      );
      expect(byDocument.get(manualDocument)?.latest_submission_revision_id).toBeNull();

      const revisions = await client.query<{
        id: string;
        origin: string;
        processing_status: string | null;
        failure_kind: string | null;
        failure_message: string | null;
      }>(`SELECT id, origin, processing_status, failure_kind, failure_message
          FROM source_document_revisions`);
      const byRevision = new Map(revisions.rows.map((row) => [row.id, row]));
      expect(byRevision.get(candidateRevision)).toMatchObject({
        origin: "submission",
        processing_status: "completed",
      });
      expect(byRevision.get(cancelledRevision)).toMatchObject({
        origin: "submission",
        processing_status: "cancelled",
      });
      expect(byRevision.get(invalidRevision)).toMatchObject({
        origin: "submission",
        processing_status: "failed",
        failure_kind: "invalid_input",
        failure_message: "unreadable",
      });
      expect(byRevision.get(manualRevision)).toMatchObject({
        origin: "manual_entry",
        processing_status: null,
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
