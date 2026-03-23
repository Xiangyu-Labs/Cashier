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

  const parts = cursor.split("|");

  if (parts.length === 3) {
    const cursorDate = parts[0];
    const cursorCreatedRaw = parts[1];
    const cursorId = parts[2];

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
        and(
          eq(sourceDocuments.entryDate, cursorDate),
          lt(sourceDocuments.createdAt, cursorCreated)
        ),
        and(
          eq(sourceDocuments.entryDate, cursorDate),
          eq(sourceDocuments.createdAt, cursorCreated),
          lt(sourceDocuments.id, cursorId)
        )
      ) ?? null
    );
  }

  if (parts.length === 2) {
    const cursorCreatedRaw = parts[0];
    const cursorId = parts[1];

    if (
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
        lt(sourceDocuments.createdAt, cursorCreated),
        and(eq(sourceDocuments.createdAt, cursorCreated), lt(sourceDocuments.id, cursorId))
      ) ?? null
    );
  }

  return null;
}

export function generateSourceDocumentNextCursor(lastItem: SourceDocumentCursorRow): string {
  const nextDate = lastItem.entryDate ?? "0000-00-00";
  return `${nextDate}|${lastItem.createdAt.toISOString()}|${lastItem.id}`;
}
