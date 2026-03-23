import { and, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";

const DELETED_SOURCE_DOCUMENT_STATUS = "deleted";

export interface LedgerEntryFilterParams {
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
}

export function buildLedgerEntryFilterConditions(
  ledgerId: string,
  filters: LedgerEntryFilterParams
): SQL<unknown>[] {
  const q = forLedger(ledgerEntries, ledgerId);
  const conditions: SQL<unknown>[] = [];
  if (q.whereActive != null) {
    conditions.push(q.whereActive);
  }

  if (filters.startDate != null && filters.startDate !== "") {
    conditions.push(
      sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND status != ${DELETED_SOURCE_DOCUMENT_STATUS} AND entry_date >= ${filters.startDate}
            )`
    );
  }

  if (filters.endDate != null && filters.endDate !== "") {
    conditions.push(
      sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND status != ${DELETED_SOURCE_DOCUMENT_STATUS} AND entry_date <= ${filters.endDate}
            )`
    );
  }

  if (filters.categoryId != null && filters.categoryId !== "") {
    conditions.push(eq(ledgerEntries.categoryId, filters.categoryId));
  }

  if (filters.currency != null && filters.currency !== "") {
    conditions.push(eq(ledgerEntries.currency, filters.currency));
  }

  if (filters.minAmount !== undefined && filters.minAmount !== null) {
    conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) >= ${filters.minAmount}`);
  }

  if (filters.maxAmount !== undefined && filters.maxAmount !== null) {
    conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) <= ${filters.maxAmount}`);
  }

  return conditions;
}

export function buildLedgerEntryCursorCondition(cursor: string | null | undefined): SQL<unknown> | null {
  if (cursor == null || cursor === "") {
    return null;
  }

  const [cursorCreated, cursorId, ...rest] = cursor.split("|");
  if (
    rest.length > 0 ||
    cursorCreated == null ||
    cursorCreated === "" ||
    cursorId == null ||
    cursorId === ""
  ) {
    return null;
  }

  const createdAt = new Date(cursorCreated);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return (
    or(
      lt(ledgerEntries.createdAt, createdAt),
      and(eq(ledgerEntries.createdAt, createdAt), lt(ledgerEntries.id, cursorId))
    ) ?? null
  );
}
