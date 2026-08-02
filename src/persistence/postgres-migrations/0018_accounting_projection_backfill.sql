-- Backfill accounting projections only where the conversion is deterministic from stored rates.
WITH candidates AS (
  SELECT
    entry.id,
    CASE
      WHEN COALESCE(entry.currency, 'CNY') = ledger.main_currency
        THEN round(entry.amount, 2)
      ELSE round(
        entry.amount
        * CASE
            WHEN ledger.main_currency = rate.base THEN 1::numeric
            ELSE (rate.rates ->> ledger.main_currency)::numeric
          END
        / CASE
            WHEN COALESCE(entry.currency, 'CNY') = rate.base THEN 1::numeric
            ELSE (rate.rates ->> COALESCE(entry.currency, 'CNY'))::numeric
          END,
        2
      )
    END AS converted_amount,
    CASE
      WHEN COALESCE(entry.currency, 'CNY') = ledger.main_currency THEN 1::numeric
      ELSE round(
        CASE
          WHEN ledger.main_currency = rate.base THEN 1::numeric
          ELSE (rate.rates ->> ledger.main_currency)::numeric
        END
        / CASE
            WHEN COALESCE(entry.currency, 'CNY') = rate.base THEN 1::numeric
            ELSE (rate.rates ->> COALESCE(entry.currency, 'CNY'))::numeric
          END,
        6
      )
    END AS exchange_rate
  FROM ledger_entries AS entry
  JOIN ledgers AS ledger
    ON ledger.id = entry.ledger_id
   AND ledger.deleted_at IS NULL
  JOIN source_documents AS document
    ON document.id = entry.source_document_id
   AND document.ledger_id = entry.ledger_id
   AND document.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT stored.base, stored.rates
    FROM currency_rates AS stored
    WHERE document.entry_date IS NULL OR stored.date = document.entry_date
    ORDER BY stored.date DESC
    LIMIT 1
  ) AS rate ON true
  WHERE entry.deleted_at IS NULL
    AND (entry.converted_amount IS NULL OR entry.exchange_rate IS NULL)
    AND (
      COALESCE(entry.currency, 'CNY') = ledger.main_currency
      OR (
        rate.base IS NOT NULL
        AND (
          COALESCE(entry.currency, 'CNY') = rate.base
          OR NULLIF(rate.rates ->> COALESCE(entry.currency, 'CNY'), '')::numeric > 0
        )
        AND (
          ledger.main_currency = rate.base
          OR NULLIF(rate.rates ->> ledger.main_currency, '')::numeric > 0
        )
      )
    )
)
UPDATE ledger_entries AS entry
SET converted_amount = candidates.converted_amount,
    exchange_rate = candidates.exchange_rate
FROM candidates
WHERE entry.id = candidates.id;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_entry_categories_active_sort
  ON entry_categories(ledger_id, sort_order, created_at, id)
  WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ledger_entries_active_source
  ON ledger_entries(ledger_id, source_document_id, source_document_revision_id, position, id)
  WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_idempotency_pending_lease
  ON idempotency_records(lease_expires_at, created_at)
  WHERE status = 'pending';
