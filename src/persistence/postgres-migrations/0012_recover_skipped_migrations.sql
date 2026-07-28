ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{"interfaceLanguage":"auto"}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "processing_attempts" DROP CONSTRAINT IF EXISTS "ck_processing_attempts_status";
--> statement-breakpoint
ALTER TABLE "processing_outbox" DROP CONSTRAINT IF EXISTS "ck_processing_outbox_status";
--> statement-breakpoint
ALTER TABLE "source_document_revisions" DROP CONSTRAINT IF EXISTS "ck_source_document_revisions_outcome";
--> statement-breakpoint
ALTER TABLE "processing_attempts" ADD CONSTRAINT "ck_processing_attempts_status" CHECK ("processing_attempts"."status" IN ('queued', 'processing', 'completed', 'anomaly', 'failed', 'cancelled'));
--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD CONSTRAINT "ck_processing_outbox_status" CHECK ("processing_outbox"."status" IN ('pending', 'claimed', 'completed', 'failed', 'cancelled'));
--> statement-breakpoint
ALTER TABLE "source_document_revisions" ADD CONSTRAINT "ck_source_document_revisions_outcome" CHECK ("source_document_revisions"."outcome" IN ('processing', 'completed', 'anomaly', 'failed', 'cancelled', 'abandoned'));
