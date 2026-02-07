CREATE INDEX `idx_accounts_user_id` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_deleted_at` ON `ledger_entries` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_service_credentials_ledger_id` ON `service_credentials` (`ledger_id`);--> statement-breakpoint
CREATE INDEX `idx_source_docs_deleted_at` ON `source_documents` (`deleted_at`);