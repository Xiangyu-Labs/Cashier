import { and, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";

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
                WHERE ledger_id = ${ledgerId} AND entry_date >= ${filters.startDate} AND deleted_at IS NULL
            )`
    );
  }

  if (filters.endDate != null && filters.endDate !== "") {
    conditions.push(
      sql`${ledgerEntries.sourceDocumentId} IN (
                SELECT id FROM source_documents
                WHERE ledger_id = ${ledgerId} AND entry_date <= ${filters.endDate} AND deleted_at IS NULL
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

  const parts = cursor.split("|");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return null;
  }

  const [cursorCreated, cursorId] = parts;
  return (
    or(
    lt(ledgerEntries.createdAt, new Date(cursorCreated)),
    and(eq(ledgerEntries.createdAt, new Date(cursorCreated)), lt(ledgerEntries.id, cursorId))
    ) ?? null
  );
}
