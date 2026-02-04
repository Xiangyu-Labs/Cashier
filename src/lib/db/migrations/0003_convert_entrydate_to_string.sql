-- Migration: Convert entry_date from timestamp (milliseconds) to yyyy-MM-dd string
-- This migration handles data format conversion after schema type change
-- Timezone: Asia/Shanghai (UTC+8)

-- Only convert entries where entry_date looks like a timestamp (length > 10)
-- This makes the migration idempotent
UPDATE ledger_entries 
SET entry_date = strftime('%Y-%m-%d', entry_date/1000, 'unixepoch', '+8 hours')
WHERE entry_date IS NOT NULL 
  AND length(entry_date) > 10;
