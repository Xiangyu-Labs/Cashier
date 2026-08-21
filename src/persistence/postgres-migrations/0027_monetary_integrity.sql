-- Expand money scale to three minor-unit digits and persist exchange rates at
-- twelve decimal places. Refuse any cast that changes an existing value.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ledger_entries
    WHERE amount::numeric(21, 3)::numeric <> amount
       OR (converted_amount IS NOT NULL AND converted_amount::numeric(21, 3)::numeric <> converted_amount)
       OR (exchange_rate IS NOT NULL AND (
         abs(exchange_rate) >= 1000000000000000000::numeric
         OR exchange_rate::numeric(30, 12)::numeric <> exchange_rate
       ))
  ) THEN
    RAISE EXCEPTION '0027 aborted: monetary values cannot be represented without loss';
  END IF;
END
$$;

ALTER TABLE ledger_entries
  ALTER COLUMN amount TYPE numeric(21, 3) USING amount::numeric(21, 3),
  ALTER COLUMN converted_amount TYPE numeric(21, 3) USING converted_amount::numeric(21, 3),
  ALTER COLUMN exchange_rate TYPE numeric(30, 12) USING exchange_rate::numeric(30, 12);
