DROP INDEX `idx_ledger_entries_ledger_created`;--> statement-breakpoint
DROP INDEX `idx_ledger_entries_ledger_category`;--> statement-breakpoint
DROP INDEX `idx_ledger_entries_ledger_active`;--> statement-breakpoint
DROP INDEX `idx_ledger_entries_ledger_source_doc`;--> statement-breakpoint
DROP INDEX `idx_ledger_entries_ledger_created_with_category`;--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_active_created` ON `ledger_entries` (`ledger_id`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_category_active` ON `ledger_entries` (`ledger_id`,`category_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_otp_tokens_verified` ON `otp_tokens` (`email`,`verified_at`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_source_docs_ledger_status_type` ON `source_documents` (`ledger_id`,`status`,`type`);--> statement-breakpoint
CREATE INDEX `idx_task_runs_created` ON `task_runs` (`created_at`);