CREATE INDEX `idx_ledger_entries_ledger_source_doc` ON `ledger_entries` (`ledger_id`,`source_document_id`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_created_with_category` ON `ledger_entries` (`ledger_id`,`created_at`,`category_id`);--> statement-breakpoint
CREATE INDEX `idx_source_docs_ledger_status_date` ON `source_documents` (`ledger_id`,`status`,`entry_date`);--> statement-breakpoint
CREATE INDEX `idx_task_runs_scope_status_created` ON `task_runs` (`scope_id`,`status`,`created_at`);