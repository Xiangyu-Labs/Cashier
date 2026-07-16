import { and, sql, type SQL } from "drizzle-orm";
import { ledgerEntries } from "@/persistence";

// Compatibility visibility SQL is adapter-private.

interface SourceDocumentDateRange {
  startDate?: string | null;
  endDate?: string | null;
}

function buildVisibleSourceDocumentIdsSubquery(
  ledgerId: string,
  dateRange?: SourceDocumentDateRange
): SQL<unknown> {
  const conditions: SQL<unknown>[] = [
    sql`ledger_id = ${ledgerId}`,
    sql`status != 'deleted'`,
    sql`deleted_at IS NULL`,
    sql`active_revision_id IS NOT NULL`,
  ];

  if (dateRange?.startDate != null && dateRange.startDate !== "") {
    conditions.push(sql`entry_date >= ${dateRange.startDate}`);
  }

  if (dateRange?.endDate != null && dateRange.endDate !== "") {
    conditions.push(sql`entry_date <= ${dateRange.endDate}`);
  }

  return sql`SELECT id FROM source_documents WHERE ${and(...conditions)}`;
}

export function buildLedgerEntryVisibilityCondition(ledgerId: string): SQL<unknown> {
  return sql`EXISTS (
    SELECT 1
    FROM source_documents AS active_documents
    WHERE active_documents.ledger_id = ${ledgerId}
      AND active_documents.id = ${ledgerEntries.sourceDocumentId}
      AND active_documents.status != 'deleted'
      AND active_documents.deleted_at IS NULL
      AND active_documents.active_revision_id IS NOT NULL
      AND active_documents.active_revision_id = ${ledgerEntries.sourceDocumentRevisionId}
  )`;
}

export function buildLedgerEntrySourceDocumentDateCondition(
  ledgerId: string,
  dateRange: SourceDocumentDateRange
): SQL<unknown> | null {
  const hasStartDate = dateRange.startDate != null && dateRange.startDate !== "";
  const hasEndDate = dateRange.endDate != null && dateRange.endDate !== "";
  if (!hasStartDate && !hasEndDate) {
    return null;
  }

  const sourceDocumentIdsInDateRange = buildVisibleSourceDocumentIdsSubquery(ledgerId, dateRange);
  return (
    and(
      sql`${ledgerEntries.sourceDocumentId} IN (${sourceDocumentIdsInDateRange})`,
      buildLedgerEntryVisibilityCondition(ledgerId)
    ) ?? null
  );
}
