-- Main-currency amount filters must use only persisted converted amounts.
--> statement-breakpoint
DROP INDEX IF EXISTS idx_ledger_entries_active_amount;
--> statement-breakpoint
CREATE INDEX idx_ledger_entries_active_amount
  ON ledger_entries(ledger_id, converted_amount)
  WHERE deleted_at IS NULL AND converted_amount IS NOT NULL;
