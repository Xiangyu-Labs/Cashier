--> statement-breakpoint
ALTER TABLE "source_document_revisions" DROP CONSTRAINT "ck_source_document_revisions_outcome";
--> statement-breakpoint
ALTER TABLE "source_document_revisions" ADD CONSTRAINT "ck_source_document_revisions_outcome" CHECK ("source_document_revisions"."outcome" IN ('queued', 'processing', 'completed', 'anomaly', 'failed', 'abandoned'));
