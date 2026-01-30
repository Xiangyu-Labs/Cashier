CREATE TYPE "public"."anomaly_code" AS ENUM('internal_error', 'invalid_content', 'evidence_anomaly', 'unknown_currency');--> statement-breakpoint
CREATE TYPE "public"."source_document_status" AS ENUM('queued', 'processing', 'completed', 'anomaly');--> statement-breakpoint
CREATE TABLE "currency_rates" (
	"date" date PRIMARY KEY NOT NULL,
	"base" text DEFAULT 'EUR' NOT NULL,
	"rates" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_editable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"category_id" uuid,
	"source_document_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text,
	"item_name" text NOT NULL,
	"description" text,
	"entry_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ai_language" text DEFAULT 'zh-CN' NOT NULL,
	"currencies" jsonb DEFAULT '["USD","AUD","BRL","CAD","CHF","CNY","EUR","GBP","HKD","JPY","SGD"]'::jsonb,
	"main_currency" text DEFAULT 'CNY',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"auto_recognize_date" boolean DEFAULT false,
	"collapse_processing_default" boolean DEFAULT false,
	"merge_similar_items" boolean DEFAULT false,
	"collapse_bills_default" boolean DEFAULT false,
	"ai_custom_prompt" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "service_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"ledger_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "service_credentials_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"title" text,
	"text" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"status" "source_document_status" DEFAULT 'queued' NOT NULL,
	"anomaly_codes" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"bull_flow_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"output" jsonb,
	"error" text,
	"total_jobs" integer DEFAULT 1,
	"completed_jobs" integer DEFAULT 0,
	"failed_jobs" integer DEFAULT 0,
	"usage" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "entry_categories" ADD CONSTRAINT "entry_categories_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_entry_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."entry_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_credentials" ADD CONSTRAINT "service_credentials_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_ledger_date" ON "ledger_entries" USING btree ("ledger_id","entry_date");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_source_doc" ON "ledger_entries" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_created_at" ON "ledger_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_shares_source_doc" ON "shares" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_status" ON "source_documents" USING btree ("ledger_id","status");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_created" ON "source_documents" USING btree ("ledger_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_task_runs_ledger_status" ON "task_runs" USING btree ("ledger_id","status");--> statement-breakpoint
CREATE INDEX "idx_task_runs_created_at" ON "task_runs" USING btree ("created_at");