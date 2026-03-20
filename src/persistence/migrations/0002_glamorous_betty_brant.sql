ALTER TABLE `source_documents` ADD `anomaly_reason` text;--> statement-breakpoint
ALTER TABLE `source_documents` DROP COLUMN `anomaly_codes`;