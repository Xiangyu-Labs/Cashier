-- Converge the migration-built database with the Drizzle schema contract.
-- Abort instead of silently repairing historical rows: an invalid currency is
-- an accounting-data incident and must be resolved explicitly before deploy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ledger_entries
    WHERE currency IS NOT NULL
      AND currency !~ '^[A-Z]{3}$'
  ) THEN
    RAISE EXCEPTION '0026 aborted: ledger_entries contains invalid currency values';
  END IF;
END
$$;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ck_ledger_entries_currency
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')
  NOT VALID;

ALTER TABLE ledger_entries
  VALIDATE CONSTRAINT ck_ledger_entries_currency;

CREATE INDEX idx_source_documents_ledger_entry_date
  ON source_documents (ledger_id, entry_date, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- The partial feed index cannot support FK ON DELETE SET NULL for historical
-- soft-deleted rows, so retain a compact all-row lookup index.
CREATE INDEX idx_ledger_entries_category_all
  ON ledger_entries (ledger_id, category_id);
