import { and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { mapLedgerEntryDto } from "./mappers";
import {
  buildLedgerEntryCursorCondition,
  buildLedgerEntryFilterConditions,
  type LedgerEntryFilterParams,
} from "./build-ledger-entry-filters";
import { revisionFiles } from "@/persistence";

interface ListLedgerEntryPageInput {
  ledgerId: string;
  limit?: number;
  cursor?: string | null;
  filters: LedgerEntryFilterParams;
}

export async function listLedgerEntryPage({
  ledgerId,
  limit = 20,
  cursor,
  filters,
}: ListLedgerEntryPageInput) {
  const conditions = buildLedgerEntryFilterConditions(ledgerId, filters);
  const cursorCondition = buildLedgerEntryCursorCondition(cursor);
  if (cursorCondition != null) {
    conditions.push(cursorCondition);
  }

  const rows = await db.query.ledgerEntries.findMany({
    where: and(...conditions),
    orderBy: (entries, { desc }) => [desc(entries.createdAt), desc(entries.id)],
    limit: limit + 1,
    with: {
      category: true,
      sourceDocument: {
        columns: {
          id: true,
          ledgerId: true,
          title: true,
          type: true,
          entryDate: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      },
    },
  });

  let nextCursor: string | undefined;
  let pagedRows = rows;
  if (rows.length > limit) {
    pagedRows = rows.slice(0, limit);
    const lastItem = pagedRows.at(-1);
    if (lastItem == null) {
      throw new AppError("Expected next ledger entry page cursor row", "INVARIANT_VIOLATION");
    }
    nextCursor = `${lastItem.createdAt.toISOString()}|${lastItem.id}`;
  }

  const revisionIds = pagedRows.flatMap((row) =>
    row.sourceDocumentRevisionId == null ? [] : [row.sourceDocumentRevisionId]
  );
  const revisionsWithFiles = new Set(
    revisionIds.length === 0
      ? []
      : (
          await db
            .select({ revisionId: revisionFiles.revisionId })
            .from(revisionFiles)
            .where(inArray(revisionFiles.revisionId, revisionIds))
        ).map((row) => row.revisionId)
  );

  const items = pagedRows.map((row) => {
    const dto = mapLedgerEntryDto({
      ...row,
      category: row.category,
      sourceDocument: row.sourceDocument,
    });

    if (dto.sourceDocument != null) {
      dto.sourceDocument = {
        ...dto.sourceDocument,
        status: "completed",
        hasImages:
          row.sourceDocumentRevisionId != null &&
          revisionsWithFiles.has(row.sourceDocumentRevisionId),
      };
    }

    return dto;
  });

  return {
    items,
    nextCursor,
  };
}
