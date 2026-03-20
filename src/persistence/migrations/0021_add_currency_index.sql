-- Add index for currency filtering
CREATE INDEX "idx_ledger_entries_ledger_currency" ON "ledger_entries" ("ledger_id", "currency", "deleted_at");
