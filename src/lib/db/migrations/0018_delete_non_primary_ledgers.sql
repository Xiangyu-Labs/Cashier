-- Migration: Delete all non-primary ledgers and add unique constraint
-- This enforces single ledger per user limit

-- Step 1: Create temp table to store ledger IDs to keep (primary or earliest)
CREATE TABLE `_keep_ledgers` (
    `user_id` TEXT PRIMARY KEY,
    `ledger_id` TEXT NOT NULL
);

--> statement-breakpoint

-- Step 2: Insert the ledger ID to keep for each user
-- Priority: Keep the one referenced by users.default_ledger_id, otherwise keep earliest
INSERT INTO `_keep_ledgers` (`user_id`, `ledger_id`)
SELECT
    l.user_id,
    CASE
        WHEN u.default_ledger_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM ledgers l2 WHERE l2.id = u.default_ledger_id
        ) THEN u.default_ledger_id
        ELSE MIN(l.id)
    END as ledger_id
FROM ledgers l
JOIN users u ON u.id = l.user_id
GROUP BY l.user_id;

--> statement-breakpoint

-- Step 3: Delete all ledgers not in the keep list (physical delete)
-- This will cascade delete all related data (entries, categories, source documents, etc.)
DELETE FROM ledgers
WHERE id NOT IN (SELECT ledger_id FROM _keep_ledgers);

--> statement-breakpoint

-- Step 4: Drop the temp table
DROP TABLE `_keep_ledgers`;

--> statement-breakpoint

-- Step 5: Create unique index on user_id (for active ledgers only)
-- Partial index: only applies to non-deleted ledgers (deleted_at IS NULL)
CREATE UNIQUE INDEX `uniq_ledgers_user_id` ON `ledgers` (`user_id`) WHERE `deleted_at` IS NULL;
