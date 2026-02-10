DROP INDEX `idx_ledger_entries_created_at`;--> statement-breakpoint
DROP INDEX `idx_ledger_entries_deleted_at`;--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_category` ON `ledger_entries` (`ledger_id`,`category_id`);--> statement-breakpoint
ALTER TABLE `ledger_entries` DROP COLUMN `metadata`;--> statement-breakpoint
DROP INDEX `idx_source_docs_deleted_at`;--> statement-breakpoint
DROP INDEX `idx_task_runs_created_at`;--> statement-breakpoint
DROP INDEX `idx_task_runs_scope`;--> statement-breakpoint
CREATE INDEX `idx_task_runs_scope_status` ON `task_runs` (`scope_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_task_runs_type_status` ON `task_runs` (`type`,`status`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `metadata`;