-- Migration: Add unique constraint on ledgers.user_id
-- This enforces single ledger per user limit
-- Pre-step: Soft-delete all but the earliest ledger for each user

-- Step 1: Soft delete all ledgers except the earliest one per user
-- This keeps the first ledger created for each user
UPDATE `ledgers`
SET `deleted_at` = CURRENT_TIMESTAMP
WHERE `deleted_at` IS NULL
  AND `id` NOT IN (
    SELECT `id`
    FROM `ledgers` AS `l1`
    WHERE `l1`.`deleted_at` IS NULL
      AND `l1`.`created_at` = (
        SELECT MIN(`created_at`)
        FROM `ledgers` AS `l2`
        WHERE `l2`.`user_id` = `l1`.`user_id`
          AND `l2`.`deleted_at` IS NULL
      )
  );

-- Step 2: Create the unique index on user_id
-- This enforces the single ledger constraint at the database level
CREATE UNIQUE INDEX `uniq_ledgers_user_id` ON `ledgers` (`user_id`);
