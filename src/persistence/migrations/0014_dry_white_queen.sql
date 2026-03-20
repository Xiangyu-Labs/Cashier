PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_id` text NOT NULL,
	`category_id` text,
	`source_document_id` text,
	`amount` text NOT NULL,
	`currency` text,
	`item_name` text NOT NULL,
	`description` text,
	`converted_amount` text,
	`exchange_rate` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `entry_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ledger_entries`("id", "ledger_id", "category_id", "source_document_id", "amount", "currency", "item_name", "description", "converted_amount", "exchange_rate", "created_at", "updated_at", "deleted_at") SELECT "id", "ledger_id", "category_id", "source_document_id", "amount", "currency", "item_name", "description", "converted_amount", "exchange_rate", "created_at", "updated_at", "deleted_at" FROM `ledger_entries`;--> statement-breakpoint
DROP TABLE `ledger_entries`;--> statement-breakpoint
ALTER TABLE `__new_ledger_entries` RENAME TO `ledger_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_source_doc` ON `ledger_entries` (`source_document_id`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_created` ON `ledger_entries` (`ledger_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_ledger_category` ON `ledger_entries` (`ledger_id`,`category_id`);