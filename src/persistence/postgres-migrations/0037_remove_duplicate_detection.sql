DROP TABLE "duplicate_reviews" CASCADE;--> statement-breakpoint
UPDATE "source_documents"
SET "current_status" = 'completed'
WHERE "current_status" = 'duplicate_pending';--> statement-breakpoint
ALTER TABLE "source_documents" ALTER COLUMN "current_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "source_documents" ALTER COLUMN "current_status" SET DEFAULT 'processing'::text;--> statement-breakpoint
DROP TYPE "source_document_status";--> statement-breakpoint
CREATE TYPE "source_document_status" AS ENUM('processing', 'completed', 'candidate_pending', 'invalid', 'failed', 'cancelled');--> statement-breakpoint
ALTER TABLE "source_documents" ALTER COLUMN "current_status" SET DEFAULT 'processing'::"source_document_status";--> statement-breakpoint
ALTER TABLE "source_documents" ALTER COLUMN "current_status" SET DATA TYPE "source_document_status" USING "current_status"::"source_document_status";--> statement-breakpoint
ALTER TABLE "ledgers" DROP COLUMN "duplicate_detection_enabled";--> statement-breakpoint
DROP TYPE "duplicate_review_status";
