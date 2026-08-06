-- Duplicate reviews become stable: every review stores the matched bill's
-- revision (plus title/date/created-at) as it was at detection time. A later
-- edit or soft-delete of the matched bill never mutates an existing verdict,
-- and retries are judged against the same snapshot.
-- The `staged` status records "this retry candidate was detected as a
-- duplicate, but the user has not accepted the candidate yet".
-- The enum is recreated (rather than ALTER TYPE ... ADD VALUE) because the
-- Drizzle migrator executes every migration inside one transaction and
-- PostgreSQL forbids using a freshly added enum value until that transaction
-- commits.
--> statement-breakpoint
-- The partial status index's predicate is bound to the old enum type; it must
-- be recreated against the new type after the swap.
DROP INDEX IF EXISTS idx_duplicate_reviews_ledger_status;
ALTER TABLE duplicate_reviews ALTER COLUMN status DROP DEFAULT;
ALTER TYPE duplicate_review_status RENAME TO duplicate_review_status_legacy;
CREATE TYPE duplicate_review_status AS ENUM ('pending', 'staged', 'kept', 'discarded');
ALTER TABLE duplicate_reviews
  ALTER COLUMN status TYPE duplicate_review_status
  USING status::text::duplicate_review_status;
ALTER TABLE duplicate_reviews ALTER COLUMN status SET DEFAULT 'pending';
DROP TYPE duplicate_review_status_legacy;
CREATE INDEX idx_duplicate_reviews_ledger_status
  ON duplicate_reviews(ledger_id, status)
  WHERE status = 'pending';
--> statement-breakpoint
ALTER TABLE duplicate_reviews
  ADD COLUMN matched_revision_id uuid,
  ADD COLUMN matched_title text,
  ADD COLUMN matched_entry_date date,
  ADD COLUMN matched_created_at timestamptz;
--> statement-breakpoint
-- Backfill snapshots from the matched document's current revision. Historical
-- reviews can only recover the best available state: the revision the matched
-- document points at while this migration runs. Reviews whose matched bill
-- has no revision at all (legacy rows whose projection was never created or
-- was removed) keep a NULL snapshot: the review record is preserved for audit
-- and the UI falls back to "matched bill unavailable". The review ID is
-- reported instead of silently fabricating a snapshot.
DO $$
DECLARE
  review_row RECORD;
  snapshot RECORD;
  resolved_revision_id uuid;
  skipped_count integer := 0;
BEGIN
  FOR review_row IN
    SELECT id, ledger_id, matched_source_document_id
    FROM duplicate_reviews
    WHERE matched_revision_id IS NULL
    ORDER BY id
  LOOP
    SELECT
      documents.active_revision_id,
      documents.pending_revision_id,
      COALESCE(
        NULLIF(btrim(documents.title), ''),
        NULLIF(btrim(revisions.title), ''),
        documents.title
      ) AS title,
      documents.entry_date,
      documents.created_at
    INTO snapshot
    FROM source_documents AS documents
    LEFT JOIN source_document_revisions AS revisions
      ON revisions.ledger_id = documents.ledger_id
     AND revisions.id = COALESCE(documents.active_revision_id, documents.pending_revision_id)
     AND revisions.source_document_id = documents.id
    WHERE documents.ledger_id = review_row.ledger_id
      AND documents.id = review_row.matched_source_document_id;

    IF snapshot.active_revision_id IS NOT NULL THEN
      resolved_revision_id := snapshot.active_revision_id;
    ELSIF snapshot.pending_revision_id IS NOT NULL THEN
      resolved_revision_id := snapshot.pending_revision_id;
    ELSE
      RAISE WARNING
        'Duplicate review % skipped: matched source document % has no revision; keeping NULL snapshot',
        review_row.id,
        review_row.matched_source_document_id;
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM source_document_revisions AS revisions
      WHERE revisions.ledger_id = review_row.ledger_id
        AND revisions.source_document_id = review_row.matched_source_document_id
        AND revisions.id = resolved_revision_id
    ) THEN
      RAISE EXCEPTION
        'Cannot backfill duplicate review %: matched revision % is missing',
        review_row.id,
        resolved_revision_id;
    END IF;

    UPDATE duplicate_reviews
    SET matched_revision_id = resolved_revision_id,
        matched_title = snapshot.title,
        matched_entry_date = snapshot.entry_date,
        matched_created_at = snapshot.created_at
    WHERE id = review_row.id;
  END LOOP;
  IF skipped_count > 0 THEN
    RAISE NOTICE 'Backfilled % duplicate reviews with a NULL snapshot (unresolvable matched bill)', skipped_count;
  END IF;
END $$;
--> statement-breakpoint
-- The snapshot columns stay nullable: a small number of legacy reviews point
-- at matched bills that have no surviving revision, and those reviews keep a
-- NULL snapshot instead of being dropped or fabricated.
--> statement-breakpoint
-- A document may now accumulate several historical reviews (one per accepted
-- or superseded revision). The old single-review-per-document constraint is
-- replaced by one review per (document, revision) plus at most one actionable
-- pending review and at most one staged review per document.
ALTER TABLE duplicate_reviews DROP CONSTRAINT IF EXISTS uq_duplicate_reviews_document;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_duplicate_reviews_document_revision
  ON duplicate_reviews(source_document_id, revision_id);
CREATE UNIQUE INDEX uq_duplicate_reviews_pending_per_document
  ON duplicate_reviews(source_document_id) WHERE status = 'pending';
CREATE UNIQUE INDEX uq_duplicate_reviews_staged_per_document
  ON duplicate_reviews(source_document_id) WHERE status = 'staged';
--> statement-breakpoint
ALTER TABLE duplicate_reviews ADD CONSTRAINT fk_duplicate_reviews_matched_revision_ledger
  FOREIGN KEY (ledger_id, matched_source_document_id, matched_revision_id)
  REFERENCES source_document_revisions(ledger_id, source_document_id, id)
  ON DELETE CASCADE;
--> statement-breakpoint
-- Status priority:
--   1. A pending revision always drives the status (processing / candidate
--      pending / anomaly / failed), even when the active revision still has a
--      pending duplicate review while a retry is in flight.
--   2. Without a pending revision, a pending duplicate review on the active
--      revision means `duplicate_pending`.
--   3. An active revision means `completed`.
--   4. Otherwise `processing`.
-- The duplicate-review probe is scoped to the active revision so historical
-- reviews for superseded revisions never re-flag a completed document.
CREATE OR REPLACE FUNCTION refresh_source_document_status()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pending_outcome revision_outcome;
BEGIN
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
  ELSIF EXISTS (
    SELECT 1 FROM duplicate_reviews review
    WHERE review.source_document_id = NEW.id
      AND review.revision_id = NEW.active_revision_id
      AND review.status = 'pending'
  ) THEN
    NEW.current_status := 'duplicate_pending';
  ELSIF NEW.active_revision_id IS NOT NULL THEN
    NEW.current_status := 'completed';
  ELSE
    NEW.current_status := 'processing';
  END IF;
  RETURN NEW;
END $$;
