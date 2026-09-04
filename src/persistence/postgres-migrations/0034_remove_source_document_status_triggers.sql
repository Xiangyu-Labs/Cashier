DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM source_documents document
    LEFT JOIN source_document_revisions revision
      ON revision.id = document.pending_revision_id
     AND revision.ledger_id = document.ledger_id
     AND revision.source_document_id = document.id
    WHERE document.pending_revision_id IS NOT NULL
      AND revision.id IS NULL
  ) THEN
    RAISE EXCEPTION 'source_documents contains an invalid pending revision pointer';
  END IF;
END $$;--> statement-breakpoint
UPDATE source_documents document
SET current_status = CASE
  WHEN document.pending_revision_id IS NOT NULL THEN CASE
    WHEN revision.outcome = 'completed' AND document.active_revision_id IS NOT NULL
      THEN 'candidate_pending'::source_document_status
    WHEN revision.outcome = 'abandoned' AND document.active_revision_id IS NOT NULL
      THEN 'completed'::source_document_status
    WHEN revision.outcome = 'abandoned'
      THEN 'cancelled'::source_document_status
    ELSE revision.outcome::text::source_document_status
  END
  WHEN EXISTS (
    SELECT 1 FROM duplicate_reviews review
    WHERE review.ledger_id = document.ledger_id
      AND review.source_document_id = document.id
      AND review.revision_id = document.active_revision_id
      AND review.status = 'pending'
  ) THEN 'duplicate_pending'::source_document_status
  WHEN document.active_revision_id IS NOT NULL THEN 'completed'::source_document_status
  ELSE 'processing'::source_document_status
END
FROM source_document_revisions revision
WHERE revision.id = document.pending_revision_id;--> statement-breakpoint
UPDATE source_documents document
SET current_status = CASE
  WHEN EXISTS (
    SELECT 1 FROM duplicate_reviews review
    WHERE review.ledger_id = document.ledger_id
      AND review.source_document_id = document.id
      AND review.revision_id = document.active_revision_id
      AND review.status = 'pending'
  ) THEN 'duplicate_pending'::source_document_status
  WHEN document.active_revision_id IS NOT NULL THEN 'completed'::source_document_status
  ELSE 'processing'::source_document_status
END
WHERE document.pending_revision_id IS NULL;--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_source_documents_refresh_status ON source_documents;--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_revisions_refresh_document_status ON source_document_revisions;--> statement-breakpoint
DROP FUNCTION IF EXISTS refresh_source_document_status();--> statement-breakpoint
DROP FUNCTION IF EXISTS touch_source_document_status_from_revision();
