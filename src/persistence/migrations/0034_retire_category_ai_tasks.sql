UPDATE `task_runs`
SET
  `status` = 'cancelled',
  `error` = NULL,
  `progress` = NULL,
  `updated_at` = unixepoch() * 1000,
  `completed_at` = COALESCE(`completed_at`, unixepoch() * 1000)
WHERE
  `type` IN ('categorize_entry', 'generate_category_metadata')
  AND `status` IN ('pending', 'running');
