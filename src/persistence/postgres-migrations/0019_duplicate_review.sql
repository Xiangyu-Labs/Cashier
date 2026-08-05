-- Duplicate detection: a first-parsed AI document that is flagged as a likely
-- duplicate is stored as a completed pending revision WITHOUT an active
-- revision. It stays out of stats until a human decides to keep or discard it.
--> statement-breakpoint
ALTER TYPE source_document_status ADD VALUE IF NOT EXISTS 'duplicate_pending';
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE duplicate_review_status AS ENUM ('pending', 'kept', 'discarded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS duplicate_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL,
  source_document_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  matched_source_document_id uuid NOT NULL,
  status duplicate_review_status NOT NULL DEFAULT 'pending',
  reason text,
  confidence numeric(4, 3),
  decision text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_duplicate_reviews_document UNIQUE (source_document_id),
  CONSTRAINT ck_duplicate_reviews_confidence
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT ck_duplicate_reviews_decision
    CHECK (decision IS NULL OR decision IN ('keep_duplicate', 'discard_duplicate', 'superseded')),
  CONSTRAINT fk_duplicate_reviews_ledger
    FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
  CONSTRAINT fk_duplicate_reviews_document_ledger
    FOREIGN KEY (ledger_id, source_document_id)
    REFERENCES source_documents(ledger_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_duplicate_reviews_revision_ledger
    FOREIGN KEY (ledger_id, revision_id)
    REFERENCES source_document_revisions(ledger_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_duplicate_reviews_matched_ledger
    FOREIGN KEY (ledger_id, matched_source_document_id)
    REFERENCES source_documents(ledger_id, id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_duplicate_reviews_ledger_status
  ON duplicate_reviews(ledger_id, status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_duplicate_reviews_matched
  ON duplicate_reviews(ledger_id, matched_source_document_id);
--> statement-breakpoint
-- The status trigger must recognise a pending duplicate review before falling
-- back to revision-based status computation, otherwise a completed pending
-- revision without an active revision would display as plain "completed".
CREATE OR REPLACE FUNCTION refresh_source_document_status()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pending_outcome revision_outcome;
BEGIN
  IF EXISTS (
    SELECT 1 FROM duplicate_reviews review
    WHERE review.source_document_id = NEW.id AND review.status = 'pending'
  ) THEN
    NEW.current_status := 'duplicate_pending';
    RETURN NEW;
  END IF;

  IF NEW.pending_revision_id IS NOT NULL THEN
    SELECT outcome INTO pending_outcome
    FROM source_document_revisions WHERE id = NEW.pending_revision_id;
    NEW.current_status := CASE
      WHEN pending_outcome = 'completed' AND NEW.active_revision_id IS NOT NULL
        THEN 'candidate_pending'::source_document_status
      WHEN pending_outcome = 'abandoned' AND NEW.active_revision_id IS NOT NULL
        THEN 'completed'::source_document_status
      WHEN pending_outcome = 'abandoned'
        THEN 'cancelled'::source_document_status
      ELSE pending_outcome::text::source_document_status
    END;
  ELSIF NEW.active_revision_id IS NOT NULL THEN
    NEW.current_status := 'completed';
  ELSE
    NEW.current_status := 'processing';
  END IF;
  RETURN NEW;
END $$;
