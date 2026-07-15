ALTER TABLE `processing_outbox` ADD `claim_token` text;--> statement-breakpoint
ALTER TABLE `processing_outbox` ADD `claim_expires_at` integer;--> statement-breakpoint
CREATE INDEX `idx_processing_outbox_claim_expiry` ON `processing_outbox` (`status`,`claim_expires_at`);