DO $$
DECLARE
  conflicting_ids text;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id::text)
  INTO conflicting_ids
  FROM users
  WHERE deleted_at IS NULL
    AND lower(email) IN (
      SELECT lower(email)
      FROM users
      WHERE deleted_at IS NULL
      GROUP BY lower(email)
      HAVING count(*) > 1
    );

  IF conflicting_ids IS NOT NULL THEN
    RAISE EXCEPTION '0031 aborted: active users have case-insensitive email conflicts; user IDs: %',
      conflicting_ids;
  END IF;
END
$$;

UPDATE users
SET email = lower(email), updated_at = now()
WHERE email <> lower(email);

DROP INDEX IF EXISTS uniq_users_active_email;
CREATE UNIQUE INDEX uniq_users_active_email
  ON users (lower(email))
  WHERE deleted_at IS NULL;

UPDATE ledger_entries AS entry
SET currency = ledger.main_currency,
    converted_amount = entry.amount,
    exchange_rate = 1,
    updated_at = now()
FROM ledgers AS ledger
WHERE entry.ledger_id = ledger.id
  AND entry.currency IS NULL;

ALTER TABLE ledger_entries
  ALTER COLUMN currency SET NOT NULL;

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ck_ledger_entries_currency;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ck_ledger_entries_currency CHECK (currency ~ '^[A-Z]{3}$');
