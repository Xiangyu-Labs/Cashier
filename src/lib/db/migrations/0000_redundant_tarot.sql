CREATE TABLE `accounts` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `otp_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`created_at` integer NOT NULL,
	`last_attempt_at` integer,
	`verified_at` integer,
	`ip_address` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `otp_tokens_token_hash_unique` ON `otp_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_otp_tokens_email` ON `otp_tokens` (`email`);--> statement-breakpoint
CREATE INDEX `idx_otp_tokens_expires` ON `otp_tokens` (`expires`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`email_verified` integer,
	`image` text,
	`default_ledger_id` text,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_tokens_token_unique` ON `verification_tokens` (`token`);--> statement-breakpoint
CREATE TABLE `currency_rates` (
	`date` text PRIMARY KEY NOT NULL,
	`base` text DEFAULT 'EUR' NOT NULL,
	`rates` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entry_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_editable` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_category_name_per_ledger` ON `entry_categories` (`ledger_id`,`name`) WHERE "entry_categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`category_id` text,
	`source_document_id` text,
	`amount` text NOT NULL,
	`currency` text,
	`item_name` text NOT NULL,
	`description` text,
	`entry_date` text,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `entry_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_date` ON `ledger_entries` (`ledger_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_source_doc` ON `ledger_entries` (`source_document_id`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_created_at` ON `ledger_entries` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_category_date` ON `ledger_entries` (`ledger_id`,`category_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_created` ON `ledger_entries` (`ledger_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ledgers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ledgers_user_id` ON `ledgers` (`user_id`);--> statement-breakpoint
CREATE TABLE `service_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`ledger_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_credentials_key_unique` ON `service_credentials` (`key`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`title` text,
	`text` text,
	`image_urls` text DEFAULT '[]',
	`status` text DEFAULT 'queued' NOT NULL,
	`anomaly_codes` text DEFAULT '[]',
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_source_docs_ledger_status` ON `source_documents` (`ledger_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_source_docs_ledger_created` ON `source_documents` (`ledger_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`output` text,
	`error` text,
	`progress` text,
	`total_jobs` integer DEFAULT 1,
	`completed_jobs` integer DEFAULT 0,
	`failed_jobs` integer DEFAULT 0,
	`token_usage` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_task_runs_ledger_status` ON `task_runs` (`ledger_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_task_runs_created_at` ON `task_runs` (`created_at`);