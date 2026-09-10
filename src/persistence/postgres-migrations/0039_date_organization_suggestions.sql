ALTER TABLE "source_document_revisions"
  ADD COLUMN "input_date_reference" date;

ALTER TABLE "source_documents"
  ADD COLUMN "date_organization_suggestion" jsonb;
