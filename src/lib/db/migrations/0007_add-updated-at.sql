ALTER TABLE `ledger_entries` ADD `updated_at` integer;
--> statement-breakpoint
UPDATE `ledger_entries` SET `updated_at` = `created_at` WHERE `updated_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `source_documents` ADD `updated_at` integer;
--> statement-breakpoint
UPDATE `source_documents` SET `updated_at` = `created_at` WHERE `updated_at` IS NULL;