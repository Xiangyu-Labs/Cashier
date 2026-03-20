ALTER TABLE `task_runs` ADD `scope_id` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `entity_type` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `entity_id` text;--> statement-breakpoint
CREATE INDEX `idx_task_runs_scope` ON `task_runs` (`scope_id`);--> statement-breakpoint
CREATE INDEX `idx_task_runs_entity` ON `task_runs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_task_runs_scope_entity` ON `task_runs` (`scope_id`,`entity_type`,`entity_id`);--> statement-breakpoint

-- Backfill existing task_runs with scopeId, entityType, and entityId
UPDATE `task_runs` SET
  `scope_id` = json_extract(`input`, '$.ledgerId'),
  `entity_type` = CASE
    WHEN `type` = 'parse_source_document' THEN 'source_document'
    WHEN `type` = 'generate_category_metadata' THEN 'category'
    WHEN `type` = 'categorize_entry' THEN 'entry'
    ELSE NULL
  END,
  `entity_id` = CASE
    WHEN `type` = 'parse_source_document' THEN json_extract(`input`, '$.sourceDocumentId')
    WHEN `type` = 'generate_category_metadata' THEN json_extract(`input`, '$.categoryId')
    WHEN `type` = 'categorize_entry' THEN json_extract(`input`, '$.entryId')
    ELSE NULL
  END
WHERE `input` IS NOT NULL AND `scope_id` IS NULL;