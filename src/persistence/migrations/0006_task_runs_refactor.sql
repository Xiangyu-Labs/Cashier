-- Clear old task_runs data (user confirmed OK) and restructure table
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS `task_runs`;
--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`input` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`progress` text,
	`token_usage` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE INDEX `idx_task_runs_status` ON `task_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_task_runs_created_at` ON `task_runs` (`created_at`);