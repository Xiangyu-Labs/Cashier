import { and, isNull, or, sql, type SQL } from "drizzle-orm";
import { ledgerEntries } from "@/persistence";

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
  const visibleSourceDocumentIds = buildVisibleSourceDocumentIdsSubquery(ledgerId);
  return or(
    isNull(ledgerEntries.sourceDocumentId),
    sql`${ledgerEntries.sourceDocumentId} IN (${visibleSourceDocumentIds})`
  )!;
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
  return sql`${ledgerEntries.sourceDocumentId} IN (${sourceDocumentIdsInDateRange})`;
}
