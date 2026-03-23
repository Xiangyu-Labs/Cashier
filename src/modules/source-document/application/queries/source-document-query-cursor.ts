import { and, eq, lt, or, type SQL } from "drizzle-orm";
import { sourceDocuments } from "@/persistence";

type SourceDocumentCursorRow = Pick<
  typeof sourceDocuments.$inferSelect,
  "id" | "entryDate" | "createdAt"
>;

export function buildSourceDocumentCursorCondition(
  cursor: string | null | undefined
): SQL<unknown> | null {
  if (cursor == null || cursor === "") return null;

  const [cursorDate, cursorCreatedRaw, cursorId] = cursor.split("|");
  if (
    cursorDate == null ||
    cursorDate === "" ||
    cursorCreatedRaw == null ||
    cursorCreatedRaw === "" ||
    cursorId == null ||
    cursorId === ""
  ) {
    return null;
  }

  const cursorCreated = new Date(cursorCreatedRaw);
  if (Number.isNaN(cursorCreated.getTime())) {
    return null;
  }

  return (
    or(
      lt(sourceDocuments.entryDate, cursorDate),
      and(eq(sourceDocuments.entryDate, cursorDate), lt(sourceDocuments.createdAt, cursorCreated)),
      and(
        eq(sourceDocuments.entryDate, cursorDate),
        eq(sourceDocuments.createdAt, cursorCreated),
        lt(sourceDocuments.id, cursorId)
      )
    ) ?? null
  );
}

export function generateSourceDocumentNextCursor(lastItem: SourceDocumentCursorRow): string {
  const nextDate = lastItem.entryDate ?? "0000-00-00";
  return `${nextDate}|${lastItem.createdAt.toISOString()}|${lastItem.id}`;
}
