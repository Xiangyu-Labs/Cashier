CREATE TABLE `idempotency_records` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT "ck_idempotency_records_status" CHECK("idempotency_records"."status" IN ('pending', 'completed'))
);
--> statement-breakpoint
CREATE INDEX `idx_idempotency_records_status_created` ON `idempotency_records` (`status`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_upload_session_files` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`upload_session_id` text NOT NULL,
	`stored_file_id` text,
	`target_id` text NOT NULL,
	`position` integer NOT NULL,
	`expected_content_type` text,
	`expected_byte_size` integer,
	`original_filename` text,
	`expected_checksum` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ledger_id`,`upload_session_id`) REFERENCES `upload_sessions`(`ledger_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ledger_id`,`stored_file_id`) REFERENCES `stored_files`(`ledger_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_upload_session_files_position" CHECK("__new_upload_session_files"."position" >= 0),
	CONSTRAINT "ck_upload_session_files_expected_byte_size" CHECK("__new_upload_session_files"."expected_byte_size" IS NULL OR "__new_upload_session_files"."expected_byte_size" >= 0),
	CONSTRAINT "ck_upload_session_files_status" CHECK("__new_upload_session_files"."status" IN ('planned', 'uploaded', 'finalized', 'rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_upload_session_files`("id", "ledger_id", "upload_session_id", "stored_file_id", "target_id", "position", "expected_content_type", "expected_byte_size", "original_filename", "expected_checksum", "status", "created_at") SELECT "id", "ledger_id", "upload_session_id", "stored_file_id", "target_id", "position", NULL, NULL, NULL, NULL, "status", "created_at" FROM `upload_session_files`;--> statement-breakpoint
DROP TABLE `upload_session_files`;--> statement-breakpoint
ALTER TABLE `__new_upload_session_files` RENAME TO `upload_session_files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_upload_session_files_session_target` ON `upload_session_files` (`upload_session_id`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_upload_session_files_session_position` ON `upload_session_files` (`upload_session_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_upload_session_files_ledger_file` ON `upload_session_files` (`ledger_id`,`stored_file_id`);
