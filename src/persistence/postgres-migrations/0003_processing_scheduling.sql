--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD COLUMN "schedule_attempt_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD COLUMN "last_scheduled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD COLUMN "next_available_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX "idx_processing_outbox_recoverable" ON "processing_outbox" ("ledger_id", "status", "next_available_at");
