DROP INDEX `uniq_ledgers_user_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_ledgers_user_id` ON `ledgers` (`user_id`) WHERE "ledgers"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE `ledgers` DROP COLUMN `name`;