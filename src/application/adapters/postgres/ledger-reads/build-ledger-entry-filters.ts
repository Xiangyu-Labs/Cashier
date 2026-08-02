import { and, eq, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries } from "@/persistence";
import {
  buildLedgerEntrySourceDocumentDateCondition,
  buildLedgerEntryVisibilityCondition,
} from "./ledger-entry-visibility";

// PostgreSQL query construction remains private to the adapter.

export interface LedgerEntryFilterParams {
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  uncategorizedOnly?: boolean;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  search?: string | null;
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

  const sourceDocumentDateRange: { startDate?: string | null; endDate?: string | null } = {};
  if (filters.startDate !== undefined) {
    sourceDocumentDateRange.startDate = filters.startDate;
  }
  if (filters.endDate !== undefined) {
    sourceDocumentDateRange.endDate = filters.endDate;
  }

  const sourceDocumentDateCondition = buildLedgerEntrySourceDocumentDateCondition(
    ledgerId,
    sourceDocumentDateRange
  );
  if (sourceDocumentDateCondition != null) {
    conditions.push(sourceDocumentDateCondition);
  } else {
    conditions.push(buildLedgerEntryVisibilityCondition(ledgerId));
  }

  if (filters.uncategorizedOnly) {
    conditions.push(isNull(ledgerEntries.categoryId));
  } else if (filters.categoryId != null && filters.categoryId !== "") {
    conditions.push(eq(ledgerEntries.categoryId, filters.categoryId));
  }

  if (filters.currency != null && filters.currency !== "") {
    conditions.push(eq(ledgerEntries.currency, filters.currency));
  }

  if (filters.minAmount !== undefined && filters.minAmount !== null) {
    conditions.push(
      sql`COALESCE(${ledgerEntries.convertedAmount}, ${ledgerEntries.amount}) >= ${filters.minAmount}`
    );
  }

  if (filters.maxAmount !== undefined && filters.maxAmount !== null) {
    conditions.push(
      sql`COALESCE(${ledgerEntries.convertedAmount}, ${ledgerEntries.amount}) <= ${filters.maxAmount}`
    );
  }

  if (filters.search != null && filters.search !== "") {
    conditions.push(
      sql`(
        position(lower(${filters.search}) in lower(${ledgerEntries.itemName})) > 0
        OR position(lower(${filters.search}) in lower(COALESCE(${ledgerEntries.description}, ''))) > 0
      )`
    );
  }

  return conditions;
}

export function buildLedgerEntryCursorCondition(
  cursor: string | null | undefined
): SQL<unknown> | null {
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
