CREATE TABLE `migration_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`migration_name` text NOT NULL,
	`checkpoint_key` text NOT NULL,
	`ledger_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`cursor` text,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`details` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_migration_checkpoints_processed_count" CHECK("migration_checkpoints"."processed_count" >= 0),
	CONSTRAINT "ck_migration_checkpoints_status" CHECK("migration_checkpoints"."status" IN ('pending', 'running', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_migration_checkpoints_name_key` ON `migration_checkpoints` (`migration_name`,`checkpoint_key`);--> statement-breakpoint
CREATE INDEX `idx_migration_checkpoints_ledger_status` ON `migration_checkpoints` (`ledger_id`,`status`);--> statement-breakpoint
CREATE TABLE `processing_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`retry_classification` text,
	`diagnostic_code` text,
	`correlation_id` text,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`,`revision_id`) REFERENCES `source_document_revisions`(`ledger_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_processing_attempts_number" CHECK("processing_attempts"."attempt_number" > 0),
	CONSTRAINT "ck_processing_attempts_status" CHECK("processing_attempts"."status" IN ('queued', 'processing', 'completed', 'anomaly', 'failed')),
	CONSTRAINT "ck_processing_attempts_retry_classification" CHECK("processing_attempts"."retry_classification" IS NULL OR "processing_attempts"."retry_classification" IN ('retryable', 'permanent', 'anomaly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_processing_attempts_revision_number` ON `processing_attempts` (`revision_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `idx_processing_attempts_ledger_status` ON `processing_attempts` (`ledger_id`,`status`);--> statement-breakpoint
CREATE TABLE `processing_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text,
	`available_at` integer NOT NULL,
	`claimed_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`,`revision_id`) REFERENCES `source_document_revisions`(`ledger_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_processing_outbox_attempt_number" CHECK("processing_outbox"."attempt_number" > 0),
	CONSTRAINT "ck_processing_outbox_status" CHECK("processing_outbox"."status" IN ('pending', 'claimed', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_processing_outbox_idempotency_key` ON `processing_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_processing_outbox_revision_attempt` ON `processing_outbox` (`revision_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `idx_processing_outbox_dispatch` ON `processing_outbox` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `revision_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`,`revision_id`) REFERENCES `source_document_revisions`(`ledger_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ledger_id`,`ledger_entry_id`) REFERENCES `ledger_entries`(`ledger_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_revision_entries_position" CHECK("revision_entries"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_revision_entries_revision_position` ON `revision_entries` (`revision_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_revision_entries_ledger_entry` ON `revision_entries` (`ledger_entry_id`);--> statement-breakpoint
CREATE TABLE `revision_files` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`stored_file_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`,`revision_id`) REFERENCES `source_document_revisions`(`ledger_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ledger_id`,`stored_file_id`) REFERENCES `stored_files`(`ledger_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_revision_files_position" CHECK("revision_files"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_revision_files_revision_position` ON `revision_files` (`revision_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_revision_files_revision_file` ON `revision_files` (`revision_id`,`stored_file_id`);--> statement-breakpoint
CREATE INDEX `idx_revision_files_ledger_file` ON `revision_files` (`ledger_id`,`stored_file_id`);--> statement-breakpoint
CREATE TABLE `source_document_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`source_document_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`submitted_text` text,
	`outcome` text DEFAULT 'queued' NOT NULL,
	`anomaly_reason` text,
	`failure_code` text,
	`submitted_at` integer NOT NULL,
	`finalized_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`,`source_document_id`) REFERENCES `source_documents`(`ledger_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_source_document_revisions_number" CHECK("source_document_revisions"."revision_number" > 0),
	CONSTRAINT "ck_source_document_revisions_outcome" CHECK("source_document_revisions"."outcome" IN ('queued', 'processing', 'completed', 'anomaly', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_source_document_revisions_ledger_id_id` ON `source_document_revisions` (`ledger_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_source_document_revisions_document_number` ON `source_document_revisions` (`source_document_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `idx_source_document_revisions_ledger_outcome` ON `source_document_revisions` (`ledger_id`,`outcome`);--> statement-breakpoint
CREATE INDEX `idx_source_document_revisions_document_created` ON `source_document_revisions` (`source_document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stored_files` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`storage_provider` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`original_filename` text,
	`checksum` text,
	`created_at` integer NOT NULL,
	`finalized_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_stored_files_byte_size" CHECK("stored_files"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_stored_files_ledger_id_id` ON `stored_files` (`ledger_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_stored_files_provider_key` ON `stored_files` (`storage_provider`,`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_stored_files_ledger_created` ON `stored_files` (`ledger_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `upload_session_files` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`upload_session_id` text NOT NULL,
	`stored_file_id` text,
	`target_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`,`upload_session_id`) REFERENCES `upload_sessions`(`ledger_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ledger_id`,`stored_file_id`) REFERENCES `stored_files`(`ledger_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_upload_session_files_position" CHECK("upload_session_files"."position" >= 0),
	CONSTRAINT "ck_upload_session_files_status" CHECK("upload_session_files"."status" IN ('planned', 'uploaded', 'finalized', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_upload_session_files_session_target` ON `upload_session_files` (`upload_session_id`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_upload_session_files_session_position` ON `upload_session_files` (`upload_session_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_upload_session_files_ledger_file` ON `upload_session_files` (`ledger_id`,`stored_file_id`);--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`finalization_token_hash` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`expires_at` integer NOT NULL,
	`finalized_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_upload_sessions_status" CHECK("upload_sessions"."status" IN ('open', 'finalized', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_upload_sessions_ledger_id_id` ON `upload_sessions` (`ledger_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_upload_sessions_finalization_token_hash` ON `upload_sessions` (`finalization_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_upload_sessions_ledger_status_expiry` ON `upload_sessions` (`ledger_id`,`status`,`expires_at`);--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `source_document_revision_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ledger_entries_ledger_id_id` ON `ledger_entries` (`ledger_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_revision` ON `ledger_entries` (`ledger_id`,`source_document_revision_id`);--> statement-breakpoint
ALTER TABLE `source_documents` ADD `active_revision_id` text;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `pending_revision_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_source_documents_ledger_id_id` ON `source_documents` (`ledger_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_source_docs_ledger_active_revision` ON `source_documents` (`ledger_id`,`active_revision_id`);--> statement-breakpoint
CREATE INDEX `idx_source_docs_ledger_pending_revision` ON `source_documents` (`ledger_id`,`pending_revision_id`);