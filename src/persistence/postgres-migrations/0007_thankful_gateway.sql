ALTER TABLE "source_document_revisions" DROP CONSTRAINT "ck_source_document_revisions_outcome";--> statement-breakpoint
UPDATE "source_document_revisions" SET "outcome" = 'processing' WHERE "outcome" = 'queued';--> statement-breakpoint
UPDATE "source_documents" SET "status" = 'processing' WHERE "status" = 'queued';--> statement-breakpoint
ALTER TABLE "source_documents" ALTER COLUMN "status" SET DEFAULT 'processing';--> statement-breakpoint
ALTER TABLE "source_document_revisions" ALTER COLUMN "outcome" SET DEFAULT 'processing';--> statement-breakpoint
ALTER TABLE "source_document_revisions" ADD CONSTRAINT "ck_source_document_revisions_outcome" CHECK ("source_document_revisions"."outcome" IN ('processing', 'completed', 'anomaly', 'failed', 'abandoned'));
