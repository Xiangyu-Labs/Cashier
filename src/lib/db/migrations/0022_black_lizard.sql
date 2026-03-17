DROP TABLE `verification_tokens`;--> statement-breakpoint
DROP INDEX `idx_ledger_entries_converted_amount`;--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_currency` ON `ledger_entries` (`ledger_id`,`currency`,`deleted_at`);--> statement-breakpoint
DROP INDEX `idx_task_runs_type_status`;