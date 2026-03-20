ALTER TABLE `source_documents` ADD `entry_date` text;--> statement-breakpoint
UPDATE `source_documents` SET `entry_date` = date(`created_at` / 1000, 'unixepoch') WHERE `entry_date` IS NULL;