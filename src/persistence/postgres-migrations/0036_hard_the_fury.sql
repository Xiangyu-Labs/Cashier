ALTER TYPE "source_document_status" RENAME VALUE 'anomaly' TO 'invalid';--> statement-breakpoint
ALTER TYPE "processing_attempt_status" RENAME VALUE 'anomaly' TO 'invalid';--> statement-breakpoint
ALTER TYPE "retry_classification" RENAME VALUE 'anomaly' TO 'invalid';--> statement-breakpoint
ALTER TYPE "revision_outcome" RENAME VALUE 'anomaly' TO 'invalid';--> statement-breakpoint
ALTER TABLE "source_document_revisions" RENAME COLUMN "anomaly_reason" TO "invalid_reason";
