import { and, eq, inArray, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import {
  buildLedgerEntrySourceDocumentDateCondition,
  buildLedgerEntryVisibilityCondition,
} from "./ledger-entry-visibility";

export interface LedgerEntryFilterParams {
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  uncategorizedOnly?: boolean;
  currency?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  searchQuery?: string | null;
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

  conditions.push(buildLedgerEntryVisibilityCondition(ledgerId));

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
    conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) >= ${filters.minAmount}`);
  }

  if (filters.maxAmount !== undefined && filters.maxAmount !== null) {
    conditions.push(sql`CAST(${ledgerEntries.convertedAmount} AS REAL) <= ${filters.maxAmount}`);
  }

  if (filters.searchQuery != null && filters.searchQuery.trim() !== "") {
    const q = `%${filters.searchQuery.trim()}%`;
    const matchingDocIds = db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.ledgerId, ledgerId),
          or(like(sourceDocuments.title, q), like(sourceDocuments.text, q))
        )
      );

    conditions.push(
      or(
        like(ledgerEntries.itemName, q),
        like(ledgerEntries.description, q),
        inArray(ledgerEntries.sourceDocumentId, matchingDocIds)
      )
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
