UPDATE ledger_entries
SET
  deleted_at = COALESCE(
    (
      SELECT COALESCE(source_documents.deleted_at, source_documents.updated_at)
      FROM source_documents
      WHERE source_documents.id = ledger_entries.source_document_id
    ),
    CAST(unixepoch('now') * 1000 AS INTEGER)
  ),
  updated_at = COALESCE(
    (
      SELECT COALESCE(source_documents.updated_at, source_documents.deleted_at)
      FROM source_documents
      WHERE source_documents.id = ledger_entries.source_document_id
    ),
    ledger_entries.updated_at
  )
WHERE ledger_entries.deleted_at IS NULL
  AND ledger_entries.source_document_id IN (
    SELECT id
    FROM source_documents
    WHERE status = 'deleted' OR deleted_at IS NOT NULL
  );
