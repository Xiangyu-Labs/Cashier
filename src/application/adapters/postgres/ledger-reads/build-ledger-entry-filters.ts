import { createHash } from "node:crypto";
import { eq, isNull, sql, type SQL } from "drizzle-orm";
import { ValidationError } from "@/lib/errors";
import { forLedger } from "@/lib/db/scoped-query";
import { ledgerEntries, sourceDocuments } from "@/persistence";
import {
  buildLedgerEntrySourceDocumentDateCondition,
  buildLedgerEntryVisibilityCondition,
} from "./ledger-entry-visibility";
import type { LedgerEntryFilterParams } from "@/modules/ledger/filters";
import { serializeLedgerQuery } from "@/modules/ledger/ledger-query";

// PostgreSQL query construction remains private to the adapter.

export type { LedgerEntryFilterParams } from "@/modules/ledger/filters";

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
    const literalPattern = `%${filters.search.toLocaleLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      sql`lower(${ledgerEntries.itemName} || ' ' || COALESCE(${ledgerEntries.description}, ''))
        LIKE ${literalPattern} ESCAPE '\'`
    );
  }

  return conditions;
}

function queryFingerprint(filters: LedgerEntryFilterParams): string {
  return createHash("sha256")
    .update(serializeLedgerQuery(filters))
    .digest("base64url")
    .slice(0, 16);
}

export function ledgerEntryOrderingExpressions(ledgerId: string) {
  const effectiveDate = sql<string>`(
    SELECT COALESCE(document.entry_date, document.created_at::date)::text
    FROM ${sourceDocuments} document
    WHERE document.id = ${ledgerEntries.sourceDocumentId}
      AND document.ledger_id = ${ledgerId}
  )`;
  const documentCreatedAt = sql<Date>`(
    SELECT document.created_at FROM ${sourceDocuments} document
    WHERE document.id = ${ledgerEntries.sourceDocumentId}
      AND document.ledger_id = ${ledgerId}
  )`;
  return { effectiveDate, documentCreatedAt };
}

interface LedgerEntryCursor {
  effectiveDate: string;
  documentCreatedAt: string;
  documentId: string;
  position: number;
  entryId: string;
  fingerprint: string;
}

export function encodeLedgerEntryCursor(
  value: Omit<LedgerEntryCursor, "fingerprint">,
  filters: LedgerEntryFilterParams
): string {
  return Buffer.from(JSON.stringify({ ...value, fingerprint: queryFingerprint(filters) })).toString(
    "base64url"
  );
}

export function buildLedgerEntryCursorCondition(
  cursor: string | null | undefined,
  ledgerId: string,
  filters: LedgerEntryFilterParams
): SQL<unknown> | null {
  if (cursor == null || cursor === "") {
    return null;
  }

  let value: LedgerEntryCursor;
  try {
    value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as LedgerEntryCursor;
  } catch {
    throw new ValidationError("Invalid ledger entry cursor");
  }
  if (
    value.fingerprint !== queryFingerprint(filters) ||
    value.effectiveDate === "" ||
    value.documentId === "" ||
    value.entryId === "" ||
    !Number.isInteger(value.position) ||
    Number.isNaN(new Date(value.documentCreatedAt).getTime())
  ) {
    throw new ValidationError("Ledger entry cursor does not match the query");
  }
  const { effectiveDate, documentCreatedAt } = ledgerEntryOrderingExpressions(ledgerId);
  return sql`(
    ${effectiveDate} < ${value.effectiveDate}
    OR (${effectiveDate} = ${value.effectiveDate} AND ${documentCreatedAt} < ${new Date(value.documentCreatedAt)})
    OR (${effectiveDate} = ${value.effectiveDate} AND ${documentCreatedAt} = ${new Date(value.documentCreatedAt)}
      AND ${ledgerEntries.sourceDocumentId} < ${value.documentId})
    OR (${effectiveDate} = ${value.effectiveDate} AND ${documentCreatedAt} = ${new Date(value.documentCreatedAt)}
      AND ${ledgerEntries.sourceDocumentId} = ${value.documentId} AND ${ledgerEntries.position} > ${value.position})
    OR (${effectiveDate} = ${value.effectiveDate} AND ${documentCreatedAt} = ${new Date(value.documentCreatedAt)}
      AND ${ledgerEntries.sourceDocumentId} = ${value.documentId} AND ${ledgerEntries.position} = ${value.position}
      AND ${ledgerEntries.id} > ${value.entryId})
  )`;
}
