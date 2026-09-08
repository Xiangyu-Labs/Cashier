ALTER TABLE "object_cleanup_jobs" ADD COLUMN "claim_token" uuid;
--> statement-breakpoint
ALTER TABLE "object_cleanup_jobs" ADD COLUMN "claim_expires_at" timestamp with time zone;
--> statement-breakpoint
-- One-time repair for deployments predating atomic rate snapshot/job insertion.
INSERT INTO exchange_rate_recalculation_jobs (rate_date, ledger_id)
SELECT DISTINCT rates.date::text, ledgers.id
FROM currency_rates AS rates
JOIN source_documents AS documents
  ON (documents.entry_date = rates.date OR documents.entry_date IS NULL)
  AND documents.deleted_at IS NULL
JOIN ledgers ON ledgers.id = documents.ledger_id AND ledgers.deleted_at IS NULL
JOIN ledger_entries AS entries
  ON entries.ledger_id = ledgers.id AND entries.source_document_id = documents.id
  AND entries.deleted_at IS NULL
  AND entries.source_document_revision_id IN (documents.active_revision_id, documents.pending_revision_id)
ON CONFLICT (rate_date, ledger_id) DO NOTHING;
