CREATE TYPE "revision_failure_kind" AS ENUM('invalid_input', 'processing_error');--> statement-breakpoint
CREATE TYPE "revision_origin" AS ENUM('submission', 'manual_edit', 'manual_entry');--> statement-breakpoint
CREATE TYPE "revision_processing_status" AS ENUM('processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint

ALTER TABLE "source_documents" DROP CONSTRAINT "source_documents_state_version_check";--> statement-breakpoint
ALTER TABLE "source_documents" DROP CONSTRAINT "fk_source_documents_pending_revision";--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_source_documents_refresh_status" ON "source_documents";--> statement-breakpoint
DROP TRIGGER IF EXISTS "trg_revisions_refresh_document_status" ON "source_document_revisions";--> statement-breakpoint
DROP FUNCTION IF EXISTS "refresh_source_document_status"();--> statement-breakpoint
DROP FUNCTION IF EXISTS "touch_source_document_status_from_revision"();--> statement-breakpoint

ALTER TABLE "source_documents" RENAME COLUMN "entry_date" TO "document_date";--> statement-breakpoint
ALTER TABLE "source_documents" RENAME COLUMN "pending_revision_id" TO "latest_submission_revision_id";--> statement-breakpoint
ALTER TABLE "source_documents" RENAME COLUMN "state_version" TO "version";--> statement-breakpoint
ALTER TABLE "source_document_revisions" RENAME COLUMN "submitted_text" TO "input_text";--> statement-breakpoint
ALTER TABLE "source_document_revisions" RENAME COLUMN "invalid_reason" TO "failure_message";--> statement-breakpoint
ALTER TABLE "source_document_revisions" RENAME COLUMN "finalized_at" TO "finished_at";--> statement-breakpoint

ALTER TABLE "source_document_revisions" ADD COLUMN "origin" "revision_origin";--> statement-breakpoint
ALTER TABLE "source_document_revisions" ADD COLUMN "input_document_date" text;--> statement-breakpoint
ALTER TABLE "source_document_revisions" ADD COLUMN "processing_status" "revision_processing_status";--> statement-breakpoint
ALTER TABLE "source_document_revisions" ADD COLUMN "failure_kind" "revision_failure_kind";--> statement-breakpoint

UPDATE "source_document_revisions" AS revision
SET "origin" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "processing_attempts" AS attempt
    WHERE attempt."revision_id" = revision."id"
  ) OR EXISTS (
    SELECT 1 FROM "processing_outbox" AS outbox
    WHERE outbox."revision_id" = revision."id"
  ) OR EXISTS (
    SELECT 1 FROM "source_documents" AS document
    WHERE document."latest_submission_revision_id" = revision."id"
  ) OR revision."outcome" IN ('processing', 'invalid', 'failed', 'cancelled', 'abandoned')
    THEN 'submission'::"revision_origin"
  WHEN revision."revision_number" = 1 AND EXISTS (
    SELECT 1 FROM "source_documents" AS document
    WHERE document."id" = revision."source_document_id" AND document."type" = 'manual'
  ) THEN 'manual_entry'::"revision_origin"
  ELSE 'manual_edit'::"revision_origin"
END;--> statement-breakpoint

UPDATE "source_document_revisions"
SET "processing_status" = CASE "outcome"
  WHEN 'processing' THEN 'processing'::"revision_processing_status"
  WHEN 'completed' THEN 'completed'::"revision_processing_status"
  WHEN 'invalid' THEN 'failed'::"revision_processing_status"
  WHEN 'failed' THEN 'failed'::"revision_processing_status"
  WHEN 'cancelled' THEN 'cancelled'::"revision_processing_status"
  WHEN 'abandoned' THEN 'cancelled'::"revision_processing_status"
END,
"failure_kind" = CASE "outcome"
  WHEN 'invalid' THEN 'invalid_input'::"revision_failure_kind"
  WHEN 'failed' THEN 'processing_error'::"revision_failure_kind"
  ELSE NULL
END
WHERE "origin" = 'submission';--> statement-breakpoint

UPDATE "source_document_revisions"
SET "processing_status" = NULL,
    "failure_kind" = NULL,
    "failure_code" = NULL,
    "failure_message" = NULL,
    "finished_at" = NULL
WHERE "origin" <> 'submission';--> statement-breakpoint

WITH latest_submission AS (
  SELECT DISTINCT ON (revision."source_document_id")
    revision."source_document_id", revision."id"
  FROM "source_document_revisions" AS revision
  WHERE revision."origin" = 'submission'
  ORDER BY revision."source_document_id", revision."revision_number" DESC, revision."created_at" DESC
)
UPDATE "source_documents" AS document
SET "latest_submission_revision_id" = latest_submission."id"
FROM latest_submission
WHERE document."id" = latest_submission."source_document_id"
  AND document."latest_submission_revision_id" IS NULL;--> statement-breakpoint

UPDATE "source_document_revisions" AS revision
SET "input_document_date" = document."document_date"::text
FROM "source_documents" AS document
WHERE document."latest_submission_revision_id" = revision."id"
  AND revision."origin" = 'submission';--> statement-breakpoint

ALTER TABLE "source_document_revisions" ALTER COLUMN "origin" SET DEFAULT 'submission';--> statement-breakpoint
ALTER TABLE "source_document_revisions" ALTER COLUMN "origin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "source_document_revisions" DROP COLUMN "outcome";--> statement-breakpoint
DROP TYPE "revision_outcome";--> statement-breakpoint

DROP INDEX IF EXISTS "idx_source_documents_active_status_feed";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_source_documents_pending_revision";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_source_documents_ledger_entry_date";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_source_document_revisions_ledger_outcome";--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "effective_date";--> statement-breakpoint
ALTER TABLE "source_documents" ADD COLUMN "effective_date" date GENERATED ALWAYS AS (COALESCE("document_date", ("created_at" AT TIME ZONE 'UTC')::date)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "fk_source_documents_latest_submission_revision" FOREIGN KEY ("ledger_id","id","latest_submission_revision_id") REFERENCES "source_document_revisions"("ledger_id","source_document_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_source_documents_latest_submission_revision" ON "source_documents" USING btree ("latest_submission_revision_id");--> statement-breakpoint
CREATE INDEX "idx_source_documents_active_feed" ON "source_documents" USING btree ("ledger_id","effective_date" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "source_documents"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_source_documents_ledger_document_date" ON "source_documents" USING btree ("ledger_id","document_date","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "source_documents"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_source_document_revisions_ledger_processing_status" ON "source_document_revisions" USING btree ("ledger_id","processing_status");--> statement-breakpoint
ALTER TABLE "source_documents" DROP COLUMN "current_status";--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_version_check" CHECK ("source_documents"."version" > 0);--> statement-breakpoint
DROP TYPE "source_document_status";
