-- Persist the per-ledger duplicate detection switch. Existing and new ledgers
-- default to enabled so the feature remains backward-compatible.
--> statement-breakpoint
ALTER TABLE "ledgers"
  ADD COLUMN IF NOT EXISTS "duplicate_detection_enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- The original duplicate-review migration left pending duplicate revisions
-- inactive. Promote only rows whose review, document, and completed revision
-- all agree on the same ledger/document identity.
--> statement-breakpoint
UPDATE source_documents AS documents
SET
  active_revision_id = reviews.revision_id,
  pending_revision_id = NULL,
  title = COALESCE(
    NULLIF(btrim(documents.title), ''),
    NULLIF(btrim(revisions.title), ''),
    documents.title
  ),
  updated_at = now()
FROM duplicate_reviews AS reviews
INNER JOIN source_document_revisions AS revisions
  ON revisions.ledger_id = reviews.ledger_id
 AND revisions.id = reviews.revision_id
 AND revisions.source_document_id = reviews.source_document_id
WHERE reviews.status = 'pending'
  AND revisions.outcome = 'completed'
  AND documents.ledger_id = reviews.ledger_id
  AND documents.id = reviews.source_document_id
  AND documents.deleted_at IS NULL
  AND documents.current_status = 'duplicate_pending'
  AND documents.active_revision_id IS NULL
  AND documents.pending_revision_id = reviews.revision_id;
