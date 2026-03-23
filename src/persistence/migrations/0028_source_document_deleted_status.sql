UPDATE source_documents
SET status = 'deleted'
WHERE deleted_at IS NOT NULL
  AND status <> 'deleted';
