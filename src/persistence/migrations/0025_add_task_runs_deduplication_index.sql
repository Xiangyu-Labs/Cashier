CREATE INDEX IF NOT EXISTS "idx_task_runs_type_dedup_status"
ON "task_runs" ("type", "deduplication_key", "status");
