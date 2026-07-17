CREATE TABLE "otp_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"ip_address" text,
	CONSTRAINT "otp_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "currency_rates" (
	"date" text PRIMARY KEY NOT NULL,
	"base" text DEFAULT 'EUR' NOT NULL,
	"rates" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_editable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"category_id" text,
	"source_document_id" text,
	"source_document_revision_id" text,
	"amount" numeric(20, 2) NOT NULL,
	"currency" text,
	"item_name" text NOT NULL,
	"description" text,
	"converted_amount" numeric(20, 2),
	"exchange_rate" numeric(30, 6),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledgers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"ledger_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "service_credentials_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"title" text,
	"text" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"type" text DEFAULT 'ai_parsed' NOT NULL,
	"anomaly_reason" text,
	"entry_date" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"active_revision_id" text,
	"pending_revision_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"key" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ck_idempotency_records_status" CHECK ("idempotency_records"."status" IN ('pending', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "processing_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"retry_classification" text,
	"diagnostic_code" text,
	"correlation_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_processing_attempts_number" CHECK ("processing_attempts"."attempt_number" > 0),
	CONSTRAINT "ck_processing_attempts_status" CHECK ("processing_attempts"."status" IN ('queued', 'processing', 'completed', 'anomaly', 'failed')),
	CONSTRAINT "ck_processing_attempts_retry_classification" CHECK ("processing_attempts"."retry_classification" IS NULL OR "processing_attempts"."retry_classification" IN ('retryable', 'permanent', 'anomaly'))
);
--> statement-breakpoint
CREATE TABLE "processing_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"available_at" timestamp with time zone NOT NULL,
	"claim_token" text,
	"claimed_at" timestamp with time zone,
	"claim_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_processing_outbox_attempt_number" CHECK ("processing_outbox"."attempt_number" > 0),
	CONSTRAINT "ck_processing_outbox_status" CHECK ("processing_outbox"."status" IN ('pending', 'claimed', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "revision_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"ledger_entry_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_revision_entries_position" CHECK ("revision_entries"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "revision_files" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"stored_file_id" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_revision_files_position" CHECK ("revision_files"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "source_document_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"source_document_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"submitted_text" text,
	"outcome" text DEFAULT 'queued' NOT NULL,
	"anomaly_reason" text,
	"failure_code" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_source_document_revisions_number" CHECK ("source_document_revisions"."revision_number" > 0),
	CONSTRAINT "ck_source_document_revisions_outcome" CHECK ("source_document_revisions"."outcome" IN ('queued', 'processing', 'completed', 'anomaly', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"original_filename" text,
	"checksum" text,
	"created_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_stored_files_byte_size" CHECK ("stored_files"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "upload_session_files" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"upload_session_id" text NOT NULL,
	"stored_file_id" text,
	"target_id" text NOT NULL,
	"position" integer NOT NULL,
	"expected_content_type" text,
	"expected_byte_size" integer,
	"original_filename" text,
	"expected_checksum" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_upload_session_files_position" CHECK ("upload_session_files"."position" >= 0),
	CONSTRAINT "ck_upload_session_files_expected_byte_size" CHECK ("upload_session_files"."expected_byte_size" IS NULL OR "upload_session_files"."expected_byte_size" >= 0),
	CONSTRAINT "ck_upload_session_files_status" CHECK ("upload_session_files"."status" IN ('planned', 'uploaded', 'finalized', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"ledger_id" text NOT NULL,
	"finalization_token_hash" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_upload_sessions_status" CHECK ("upload_sessions"."status" IN ('open', 'finalized', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ledger_entries_ledger_id_id" ON "ledger_entries" USING btree ("ledger_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_documents_ledger_id_id" ON "source_documents" USING btree ("ledger_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_document_revisions_ledger_id_id" ON "source_document_revisions" USING btree ("ledger_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stored_files_ledger_id_id" ON "stored_files" USING btree ("ledger_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_upload_sessions_ledger_id_id" ON "upload_sessions" USING btree ("ledger_id","id");--> statement-breakpoint
ALTER TABLE "entry_categories" ADD CONSTRAINT "entry_categories_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_entry_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "entry_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_credentials" ADD CONSTRAINT "service_credentials_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_attempts" ADD CONSTRAINT "fk_processing_attempts_revision_ledger" FOREIGN KEY ("ledger_id","revision_id") REFERENCES "source_document_revisions"("ledger_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_outbox" ADD CONSTRAINT "fk_processing_outbox_revision_ledger" FOREIGN KEY ("ledger_id","revision_id") REFERENCES "source_document_revisions"("ledger_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_entries" ADD CONSTRAINT "fk_revision_entries_revision_ledger" FOREIGN KEY ("ledger_id","revision_id") REFERENCES "source_document_revisions"("ledger_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_entries" ADD CONSTRAINT "fk_revision_entries_ledger_entry_ledger" FOREIGN KEY ("ledger_id","ledger_entry_id") REFERENCES "ledger_entries"("ledger_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_files" ADD CONSTRAINT "fk_revision_files_revision_ledger" FOREIGN KEY ("ledger_id","revision_id") REFERENCES "source_document_revisions"("ledger_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_files" ADD CONSTRAINT "fk_revision_files_stored_file_ledger" FOREIGN KEY ("ledger_id","stored_file_id") REFERENCES "stored_files"("ledger_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document_revisions" ADD CONSTRAINT "fk_revisions_source_document_ledger" FOREIGN KEY ("ledger_id","source_document_id") REFERENCES "source_documents"("ledger_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session_files" ADD CONSTRAINT "fk_upload_session_files_session_ledger" FOREIGN KEY ("ledger_id","upload_session_id") REFERENCES "upload_sessions"("ledger_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_session_files" ADD CONSTRAINT "fk_upload_session_files_stored_file_ledger" FOREIGN KEY ("ledger_id","stored_file_id") REFERENCES "stored_files"("ledger_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_otp_tokens_email" ON "otp_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_otp_tokens_expires" ON "otp_tokens" USING btree ("expires");--> statement-breakpoint
CREATE INDEX "idx_otp_tokens_verified" ON "otp_tokens" USING btree ("email","verified_at");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_category_name_per_ledger" ON "entry_categories" USING btree ("ledger_id","name") WHERE "entry_categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_source_doc" ON "ledger_entries" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_ledger_revision" ON "ledger_entries" USING btree ("ledger_id","source_document_revision_id");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_ledger_active_created" ON "ledger_entries" USING btree ("ledger_id","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_ledger_category_active" ON "ledger_entries" USING btree ("ledger_id","category_id","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_ledger_entries_ledger_currency" ON "ledger_entries" USING btree ("ledger_id","currency","deleted_at");--> statement-breakpoint
CREATE INDEX "idx_ledgers_user_id" ON "ledgers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ledgers_user_id" ON "ledgers" USING btree ("user_id") WHERE "ledgers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_service_credentials_ledger_id" ON "service_credentials" USING btree ("ledger_id");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_status" ON "source_documents" USING btree ("ledger_id","status");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_created" ON "source_documents" USING btree ("ledger_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_entry_date" ON "source_documents" USING btree ("ledger_id","entry_date");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_status_date" ON "source_documents" USING btree ("ledger_id","status","entry_date");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_status_type" ON "source_documents" USING btree ("ledger_id","status","type");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_active_revision" ON "source_documents" USING btree ("ledger_id","active_revision_id");--> statement-breakpoint
CREATE INDEX "idx_source_docs_ledger_pending_revision" ON "source_documents" USING btree ("ledger_id","pending_revision_id");--> statement-breakpoint
CREATE INDEX "idx_idempotency_records_status_created" ON "idempotency_records" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_processing_attempts_revision_number" ON "processing_attempts" USING btree ("revision_id","attempt_number");--> statement-breakpoint
CREATE INDEX "idx_processing_attempts_ledger_status" ON "processing_attempts" USING btree ("ledger_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_processing_outbox_idempotency_key" ON "processing_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_processing_outbox_revision_attempt" ON "processing_outbox" USING btree ("revision_id","attempt_number");--> statement-breakpoint
CREATE INDEX "idx_processing_outbox_dispatch" ON "processing_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "idx_processing_outbox_claim_expiry" ON "processing_outbox" USING btree ("status","claim_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_revision_entries_revision_position" ON "revision_entries" USING btree ("revision_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_revision_entries_ledger_entry" ON "revision_entries" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_revision_files_revision_position" ON "revision_files" USING btree ("revision_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_revision_files_revision_file" ON "revision_files" USING btree ("revision_id","stored_file_id");--> statement-breakpoint
CREATE INDEX "idx_revision_files_ledger_file" ON "revision_files" USING btree ("ledger_id","stored_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_document_revisions_document_number" ON "source_document_revisions" USING btree ("source_document_id","revision_number");--> statement-breakpoint
CREATE INDEX "idx_source_document_revisions_ledger_outcome" ON "source_document_revisions" USING btree ("ledger_id","outcome");--> statement-breakpoint
CREATE INDEX "idx_source_document_revisions_document_created" ON "source_document_revisions" USING btree ("source_document_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stored_files_provider_key" ON "stored_files" USING btree ("storage_provider","storage_key");--> statement-breakpoint
CREATE INDEX "idx_stored_files_ledger_created" ON "stored_files" USING btree ("ledger_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_upload_session_files_session_target" ON "upload_session_files" USING btree ("upload_session_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_upload_session_files_session_position" ON "upload_session_files" USING btree ("upload_session_id","position");--> statement-breakpoint
CREATE INDEX "idx_upload_session_files_ledger_file" ON "upload_session_files" USING btree ("ledger_id","stored_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_upload_sessions_finalization_token_hash" ON "upload_sessions" USING btree ("finalization_token_hash");--> statement-breakpoint
CREATE INDEX "idx_upload_sessions_ledger_status_expiry" ON "upload_sessions" USING btree ("ledger_id","status","expires_at");
