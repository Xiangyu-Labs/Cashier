import { and, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { sourceDocuments } from "@/persistence";

import type { SourceDocumentRow } from "./mappers";

function decodeCursor(cursor: string): { entryDate: string; createdAt: Date; id: string } | null {
  const [entryDate, createdAtValue, id, ...rest] = cursor.split("|");
  if (
    rest.length > 0 ||
    entryDate == null ||
    entryDate === "" ||
    createdAtValue == null ||
    createdAtValue === "" ||
    id == null ||
    id === ""
  ) {
    return null;
  }
  const createdAt = new Date(createdAtValue);
  return Number.isNaN(createdAt.getTime()) ? null : { entryDate, createdAt, id };
}

export function cursorCondition(cursor: string | null | undefined): SQL<unknown> | null {
  if (cursor == null || cursor === "") return null;
  const decoded = decodeCursor(cursor);
  if (decoded == null) return null;
  return (
    or(
      sql`${sourceDocuments.effectiveDate} < ${decoded.entryDate}::date`,
      and(
        sql`${sourceDocuments.effectiveDate} = ${decoded.entryDate}::date`,
        lt(sourceDocuments.createdAt, decoded.createdAt)
      ),
      and(
        sql`${sourceDocuments.effectiveDate} = ${decoded.entryDate}::date`,
        eq(sourceDocuments.createdAt, decoded.createdAt),
        sql`${sourceDocuments.id} < ${decoded.id}`
      )
    ) ?? null
  );
}

export function encodeCursor(row: SourceDocumentRow): string {
  return `${row.effectiveDate}|${row.createdAt.toISOString()}|${row.id}`;
}
