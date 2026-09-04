ALTER TABLE "source_documents" ADD COLUMN "state_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_state_version_check" CHECK ("source_documents"."state_version" > 0);
