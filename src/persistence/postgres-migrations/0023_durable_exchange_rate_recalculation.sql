CREATE TYPE "exchange_rate_recalculation_status" AS ENUM('pending', 'claimed', 'failed');
--> statement-breakpoint
CREATE TABLE "exchange_rate_recalculation_jobs" (
	"rate_date" text NOT NULL,
	"ledger_id" uuid NOT NULL,
	"status" "exchange_rate_recalculation_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claim_token" uuid,
	"claim_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rate_recalculation_jobs_rate_date_ledger_id_pk"
		PRIMARY KEY ("rate_date", "ledger_id"),
	CONSTRAINT "exchange_rate_recalculation_jobs_ledger_id_ledgers_id_fk"
		FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id")
		ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "idx_exchange_rate_recalculation_jobs_due"
	ON "exchange_rate_recalculation_jobs" USING btree ("status", "next_attempt_at");
